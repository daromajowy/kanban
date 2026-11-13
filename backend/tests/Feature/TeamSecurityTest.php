<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\BoardDocuments;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class TeamSecurityTest extends TestCase
{
    use LazilyRefreshDatabase;

    private const BOARD = 'b9e5466d-b243-4660-b8a3-25271eadbed5';

    private const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

    private const PASSWORD = 'A-local-test-password-2026';

    private const CSRF = 'test-only-csrf-token-not-a-production-secret';

    private function boardData(): array
    {
        return ['tasks' => [], 'members' => [], 'stages' => [
            ['id' => 'todo', 'title' => 'Do zrobienia', 'color' => '#64748b'],
            ['id' => 'in_progress', 'title' => 'W toku', 'color' => '#d97706'],
            ['id' => 'done', 'title' => 'Zrobione', 'color' => '#0d9488'],
        ]];
    }

    private function member(bool $mfa = true, string $role = 'member'): User
    {
        $user = User::factory()->create(['password' => Hash::make(self::PASSWORD), 'mfa_secret' => $mfa ? self::SECRET : null,
            'mfa_confirmed_at' => $mfa ? now() : null])->refresh();
        if (! DB::table('boards')->where('id', self::BOARD)->exists()) {
            DB::table('boards')->insert(['id' => self::BOARD, 'name' => Crypt::encryptString('Synthetic board'), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('documents')->insert(['board_id' => self::BOARD, 'kind' => 'kanban', 'revision' => 7,
                'ciphertext' => Crypt::encryptString(json_encode($this->boardData())), 'updated_at' => now()]);
            DB::table('documents')->insert(['board_id' => self::BOARD, 'kind' => 'strategy', 'revision' => 2,
                'ciphertext' => Crypt::encryptString('{"version":2,"cards":[]}'), 'updated_at' => now()]);
        }
        DB::table('memberships')->insert(['board_id' => self::BOARD, 'user_id' => $user->id, 'display_name' => 'Test member', 'role' => $role]);

        return $user;
    }

    private function authenticated(User $user, bool $mfa = true): static
    {
        return $this->actingAs($user)->withSession(['_token' => self::CSRF, 'password_at' => now()->timestamp,
            'seen_at' => now()->timestamp, 'auth_version' => $user->auth_version, 'mfa_verified' => $mfa])
            ->withHeaders(['X-CSRF-TOKEN' => self::CSRF, 'Origin' => 'http://localhost']);
    }

    public static function protectedPaths(): array
    {
        return [['kanban'], ['strategy'], ['images/content?path=test']];
    }

    #[DataProvider('protectedPaths')]
    public function test_anonymous_requests_cannot_read_boards_or_images(string $path): void
    {
        $this->getJson('/api/boards/'.self::BOARD.'/'.$path)->assertUnauthorized();
    }

    public function test_password_only_session_cannot_read_private_data(): void
    {
        $this->authenticated($this->member(), false)->getJson('/api/boards/'.self::BOARD.'/kanban')
            ->assertForbidden()->assertJsonPath('message', 'Potwierdź logowanie kodem z aplikacji.');
    }

    public function test_csrf_token_is_required_even_when_origin_is_same_site(): void
    {
        $this->withHeader('Origin', 'http://localhost')->postJson('/api/login', ['email' => 'member@example.test', 'password' => self::PASSWORD])->assertStatus(419);
    }

    public function test_other_origin_is_rejected_despite_valid_csrf(): void
    {
        $this->authenticated($this->member())->withHeader('Origin', 'https://evil.example')
            ->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $this->boardData()])->assertForbidden();
        $this->assertDatabaseHas('documents', ['kind' => 'kanban', 'revision' => 7]);
    }

    public function test_board_access_gate_covers_members_admins_and_outsiders(): void
    {
        $member = $this->member();
        $admin = $this->member(role: 'admin');
        $outsider = User::factory()->create()->refresh();
        $this->assertTrue(Gate::forUser($member)->allows('board-access', self::BOARD));
        $this->assertTrue(Gate::forUser($admin)->allows('board-access', self::BOARD));
        $this->assertFalse(Gate::forUser($outsider)->allows('board-access', self::BOARD));
    }

    public function test_cross_board_access_returns_404(): void
    {
        $this->authenticated($this->member())->getJson('/api/boards/00000000-0000-4000-8000-000000000123/kanban')->assertNotFound();
    }

    public function test_revoked_membership_blocks_previously_authorized_session(): void
    {
        $user = $this->member();
        DB::table('memberships')->where('user_id', $user->id)->delete();
        $this->authenticated($user)->getJson('/api/boards/'.self::BOARD.'/kanban')->assertNotFound();
    }

    public function test_session_expires_after_a_day_without_user_activity(): void
    {
        $user = $this->member();
        $this->authenticated($user)->withSession(['seen_at' => now()->subDay()->subSecond()->timestamp])
            ->getJson('/api/boards/'.self::BOARD.'/kanban')->assertUnauthorized();
    }

    public function test_authenticated_session_survives_an_overnight_break(): void
    {
        $user = $this->member();
        $this->authenticated($user)->withSession(['password_at' => now()->subDays(6)->timestamp,
            'seen_at' => now()->subHours(18)->timestamp])
            ->getJson('/api/boards/'.self::BOARD.'/kanban')->assertOk()->assertJsonPath('revision', 7);
    }

    public function test_session_expires_a_week_after_login_even_with_recent_activity(): void
    {
        $this->authenticated($this->member())->withSession(['password_at' => now()->subDays(7)->subSecond()->timestamp])
            ->getJson('/api/boards/'.self::BOARD.'/kanban')->assertUnauthorized();
    }

    public function test_pending_mfa_still_expires_after_ten_minutes(): void
    {
        $this->authenticated($this->member(), false)->withSession(['password_at' => now()->subMinutes(10)->subSecond()->timestamp])
            ->getJson('/api/boards/'.self::BOARD.'/kanban')->assertUnauthorized();
    }

    public function test_background_polling_does_not_extend_idle_time_but_user_activity_does(): void
    {
        $this->freezeTime();
        $lastSeen = now()->subHours(18)->timestamp;
        $this->authenticated($this->member())->withSession(['seen_at' => $lastSeen])
            ->getJson('/api/session')->assertOk()->assertSessionHas('seen_at', $lastSeen);
        $this->getJson('/api/boards/'.self::BOARD.'/kanban')->assertOk()->assertSessionHas('seen_at', $lastSeen);
        $this->withHeader('X-User-Active', '1')->getJson('/api/boards/'.self::BOARD.'/kanban')
            ->assertOk()->assertSessionHas('seen_at', now()->timestamp);
    }

    public function test_session_cookie_is_persistent_and_retains_browser_security_flags(): void
    {
        $this->freezeTime();
        config(['session.driver' => 'database', 'session.secure' => true]);
        $response = $this->getJson('/api/session')->assertOk();
        $cookie = $response->getCookie(config('session.cookie'), false);
        $this->assertNotNull($cookie);
        $this->assertSame(now()->addDay()->timestamp, $cookie->getExpiresTime());
        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('strict', $cookie->getSameSite());
        $this->assertSame('/', $cookie->getPath());
        $this->assertNull($cookie->getDomain());
    }

    public function test_database_session_storage_retains_an_overnight_session_and_expires_old_ones(): void
    {
        $this->freezeTime();
        config(['session.driver' => 'database']);
        $store = app('session')->driver();
        $store->start();
        $store->put('test_marker', 'synthetic-session-only');
        $store->save();
        $sessionId = $store->getId();
        $this->travel(18)->hours();
        $store->flush();
        $store->start();
        $this->assertSame($sessionId, $store->getId());
        $this->assertSame('synthetic-session-only', $store->get('test_marker'));
        $this->travel(7)->hours();
        $store->flush();
        $store->start();
        $this->assertNull($store->get('test_marker'));
    }

    public function test_auth_version_change_revokes_existing_session(): void
    {
        $user = $this->member();
        $this->authenticated($user)->withSession(['auth_version' => 0])
            ->getJson('/api/boards/'.self::BOARD.'/kanban')->assertUnauthorized();
    }

    public function test_password_login_requires_mfa_and_does_not_return_user_data(): void
    {
        $user = $this->member();
        $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF)
            ->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('state', 'challenge')->assertJsonPath('user', null)->assertSessionHas('mfa_verified', false);
    }

    public function test_new_member_must_enroll_mfa(): void
    {
        $user = $this->member(false);
        $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF)
            ->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('state', 'setup')->assertSessionHas('mfa_verified', false);
    }

    public function test_wrong_password_and_unknown_account_have_same_error(): void
    {
        $user = $this->member();
        $known = $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF)
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable()->json();
        $unknown = $this->postJson('/api/login', ['email' => 'unknown@example.test', 'password' => 'wrong'])->assertUnprocessable()->json();
        $this->assertSame($known, $unknown);
    }

    public function test_repeated_login_attempts_are_limited(): void
    {
        $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF);
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/login', ['email' => 'unknown@example.test', 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->postJson('/api/login', ['email' => 'unknown@example.test', 'password' => 'wrong'])->assertTooManyRequests();
    }

    public function test_correct_totp_completes_login_and_consumes_time_step(): void
    {
        $user = $this->member();
        $code = (new Google2FA)->getCurrentOtp(self::SECRET);
        $this->authenticated($user, false)->postJson('/api/mfa/challenge', ['code' => $code])
            ->assertOk()->assertJsonPath('state', 'authenticated')->assertSessionHas('mfa_verified', true);
        $this->assertGreaterThan(0, $user->fresh()->mfa_last_step);
    }

    public function test_totp_replay_is_rejected(): void
    {
        $user = $this->member();
        $totp = new Google2FA;
        $user->mfa_last_step = $totp->getTimestamp();
        $user->save();
        $this->authenticated($user, false)->postJson('/api/mfa/challenge', ['code' => $totp->getCurrentOtp(self::SECRET)])
            ->assertUnprocessable()->assertSessionHas('mfa_verified', false);
    }

    public function test_recovery_code_is_consumed_and_never_returned(): void
    {
        $user = $this->member();
        $user->recovery_hashes = [hash('sha256', 'abcdef1234567890')];
        $user->save();
        $response = $this->authenticated($user, false)->postJson('/api/mfa/challenge', ['code' => 'abcdef1234567890'])
            ->assertOk()->assertSessionHas('mfa_verified', true);
        $this->assertSame([], $user->fresh()->recovery_hashes);
        $this->assertStringNotContainsString('abcdef1234567890', $response->getContent());
    }

    public function test_setup_confirmation_encrypts_secret_and_hashes_recovery_codes(): void
    {
        $user = $this->member(false);
        $code = (new Google2FA)->getCurrentOtp(self::SECRET);
        $response = $this->authenticated($user, false)->withSession(['pending_mfa_secret' => self::SECRET])
            ->postJson('/api/mfa/confirm', ['code' => $code])->assertOk()->assertJsonCount(10, 'codes');
        $stored = DB::table('users')->where('id', $user->id)->first();
        $this->assertStringNotContainsString(self::SECRET, $stored->mfa_secret);
        $this->assertStringNotContainsString($response->json('codes.0'), $stored->recovery_hashes);
        $this->assertNotNull($user->fresh()->mfa_confirmed_at);
    }

    public function test_document_save_is_encrypted_and_stale_revision_cannot_overwrite(): void
    {
        $user = $this->member();
        $data = $this->boardData();
        $data['stages'][0]['title'] = 'Confidential synthetic stage';
        $this->authenticated($user)->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $data])
            ->assertOk()->assertJsonPath('revision', 8)->assertJsonPath('data.stages.0.title', 'Confidential synthetic stage');
        $stored = DB::table('documents')->where('kind', 'kanban')->first();
        $this->assertStringNotContainsString('Confidential synthetic stage', $stored->ciphertext);
        $this->assertDatabaseHas('document_versions', ['kind' => 'kanban', 'revision' => 7]);
        $this->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $this->boardData()])->assertConflict();
        $this->assertSame('Confidential synthetic stage', app(BoardDocuments::class)->load(self::BOARD, 'kanban')['data']['stages'][0]['title']);
    }

    public function test_unexpected_permission_fields_cannot_be_saved(): void
    {
        $data = [...$this->boardData(), 'role' => 'admin'];
        $this->authenticated($this->member())->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $data])->assertUnprocessable();
        $this->assertDatabaseHas('memberships', ['role' => 'member']);
    }

    public function test_oversized_documents_are_rejected_without_modifying_revision(): void
    {
        $data = $this->boardData();
        $data['tasks'] = [['id' => 'test', 'description' => str_repeat('x', 2000001)]];
        $this->authenticated($this->member())->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $data])->assertUnprocessable();
        $this->assertDatabaseHas('documents', ['kind' => 'kanban', 'revision' => 7]);
    }

    public function test_private_images_are_encrypted_and_served_only_to_authorized_member(): void
    {
        Storage::fake('local');
        $user = $this->member();
        $file = UploadedFile::fake()->image('photo.png', 2, 2);
        $upload = $this->authenticated($user)->post('/api/boards/'.self::BOARD.'/images', ['file' => $file, 'taskId' => 'task-1'])->assertCreated();
        $path = $upload->json('path');
        $bytes = Storage::disk('local')->get('images/'.hash('sha256', $path).'.bin');
        $this->assertStringNotContainsString("\x89PNG", $bytes);
        $this->get('/api/boards/'.self::BOARD.'/images/content?path='.rawurlencode($path))->assertOk()->assertHeader('Content-Type', 'image/png');
        Storage::disk('local')->assertExists('images/'.hash('sha256', $path).'.bin');
    }

    public function test_html_disguised_as_image_is_rejected(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->createWithContent('unsafe.png', '<script>alert(1)</script>');
        $this->authenticated($this->member())->post('/api/boards/'.self::BOARD.'/images', ['file' => $file, 'taskId' => 'task-1'])->assertUnprocessable();
        $this->assertDatabaseCount('private_images', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('images'));
    }

    public function test_private_file_path_traversal_is_rejected(): void
    {
        $this->authenticated($this->member())->getJson('/api/boards/'.self::BOARD.'/images/content?path='.rawurlencode(self::BOARD.'/../../.env'))->assertNotFound();
    }

    public function test_session_response_does_not_expose_credentials_and_has_security_headers(): void
    {
        $user = $this->member();
        $response = $this->authenticated($user)->getJson('/api/session')->assertOk()
            ->assertHeader('X-Frame-Options', 'DENY')->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'no-referrer')->assertJsonPath('user.role', 'member');
        $this->assertStringNotContainsString(self::SECRET, $response->getContent());
        $this->assertStringNotContainsString($user->password, $response->getContent());
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_password_reset_preserves_mfa_and_revokes_old_sessions(): void
    {
        config(['team.password_reset_enabled' => true]);
        $user = $this->member();
        $token = Password::broker()->createToken($user);
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $user->id, 'payload' => 'old', 'last_activity' => now()->timestamp]);
        $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF)
            ->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token,
                'password' => 'A-new-test-password-2026', 'password_confirmation' => 'A-new-test-password-2026'])->assertOk();
        $fresh = $user->fresh();
        $this->assertTrue(Hash::check('A-new-test-password-2026', $fresh->password));
        $this->assertSame(self::SECRET, $fresh->mfa_secret);
        $this->assertSame($user->auth_version + 1, $fresh->auth_version);
        $this->assertDatabaseCount('sessions', 0);
        $this->assertFalse(Password::broker()->tokenExists($fresh, $token));
    }

    public function test_bcrypt_password_byte_limit_prevents_multibyte_truncation(): void
    {
        config(['team.password_reset_enabled' => true]);
        $user = $this->member();
        $token = Password::broker()->createToken($user);
        $password = str_repeat('ą', 40);
        $this->withSession(['_token' => self::CSRF])->withHeader('X-CSRF-TOKEN', self::CSRF)
            ->postJson('/api/reset-password', ['email' => $user->email, 'token' => $token,
                'password' => $password, 'password_confirmation' => $password])->assertUnprocessable();
        $this->assertSame($user->password, $user->fresh()->password);
    }

    public function test_task_roundtrip_preserves_empty_fields_whitespace_and_strict_types(): void
    {
        $data = $this->boardData();
        $data['tasks'] = [['id' => 'task-roundtrip', 'title' => 'Test zadania', 'description' => "  Dane\n", 'dueDate' => '',
            'closingStatus' => '', 'assigneeId' => null, 'assigneeIds' => [], 'tags' => [], 'subtasks' => [],
            'status' => 'todo', 'priority' => 'medium', 'createdAt' => '2026-11-12T15:00:00.000Z', 'updatedAt' => '2026-11-12T15:00:00.000Z']];
        $response = $this->authenticated($this->member())->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 7, 'data' => $data])->assertOk();
        $this->assertSame($data, $response->json('data'));
        $this->assertSame($data, app(BoardDocuments::class)->load(self::BOARD, 'kanban')['data']);
        $data['tasks'][0]['dueDate'] = null;
        $this->putJson('/api/boards/'.self::BOARD.'/kanban', ['revision' => 8, 'data' => $data])->assertUnprocessable();
        $this->assertDatabaseHas('documents', ['kind' => 'kanban', 'revision' => 8]);
    }
}
