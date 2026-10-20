package ru.godeck;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = AuthException.class)
public class AuthService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration RESET_TTL = Duration.ofMinutes(30);
    private static final Duration LOGIN_LOCK = Duration.ofMinutes(15);
    private static final int COOLDOWN = 60;
    private static final int MAX_ATTEMPTS = 5;
    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JavaMailSender mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final String from;
    private final String frontendUrl;
    private final String dummyHash;

    public AuthService(JdbcClient db, PasswordEncoder passwords, JavaMailSender mail, Clock clock,
                       @Value("${godeck.mail-from}") String from,
                       @Value("${godeck.frontend-url}") String frontendUrl) {
        this.db = db;
        this.passwords = passwords;
        this.mail = mail;
        this.clock = clock;
        this.from = from;
        this.frontendUrl = frontendUrl.replaceAll("/+$", "");
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> identify(String rawEmail, UUID challengeId) {
        String email = normalize(rawEmail);
        if (db.sql("SELECT count(*) FROM app_users WHERE email = ?").param(email).query(Integer.class).single() > 0) {
            return Map.of("step", "password");
        }
        var pending = db.sql("SELECT * FROM email_verifications WHERE email = ? AND challenge_id = ?")
                .param(email).param(challengeId).query(Pending.class).optional();
        if (pending.isPresent()) {
            return Map.of("step", "verify", "challenge", challenge(pending.get().sentAt));
        }
        return Map.of("step", "create-password");
    }

    public UUID register(String rawEmail, String password) {
        String email = normalize(rawEmail);
        checkPassword(password);
        if (db.sql("SELECT count(*) FROM app_users WHERE email = ?").param(email).query(Integer.class).single() > 0) {
            throw new AuthException("invalid-input", HttpStatus.CONFLICT);
        }
        Instant now = clock.instant();
        UUID id = UUID.randomUUID();
        String code = newCode();
        // One atomic conditional upsert also enforces cooldown for concurrent requests.
        int updated = db.sql("""
                INSERT INTO email_verifications
                  (email, challenge_id, password_hash, code_hash, consent_at, expires_at, sent_at, attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT (email) DO UPDATE SET challenge_id = EXCLUDED.challenge_id,
                  password_hash = EXCLUDED.password_hash, code_hash = EXCLUDED.code_hash,
                  consent_at = EXCLUDED.consent_at, expires_at = EXCLUDED.expires_at,
                  sent_at = EXCLUDED.sent_at, attempts = 0
                WHERE email_verifications.sent_at <= ?
                """).params(email, id, passwords.encode(password), passwords.encode(code), ts(now),
                        ts(now.plus(CODE_TTL)), ts(now), ts(now.minusSeconds(COOLDOWN))).update();
        if (updated == 0) throw new AuthException("rate-limited", HttpStatus.TOO_MANY_REQUESTS, COOLDOWN);
        sendCode(email, code);
        return id;
    }

    public AuthPrincipal verify(String rawEmail, String code, UUID challengeId) {
        Pending p = pending(normalize(rawEmail), challengeId);
        if (p.attempts >= MAX_ATTEMPTS) throw new AuthException("too-many-attempts", HttpStatus.TOO_MANY_REQUESTS);
        if (!p.expiresAt.isAfter(clock.instant())) throw new AuthException("expired-code", HttpStatus.BAD_REQUEST);
        if (!passwords.matches(code, p.codeHash)) {
            db.sql("UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?").param(p.email).update();
            throw new AuthException(p.attempts + 1 >= MAX_ATTEMPTS ? "too-many-attempts" : "invalid-code",
                    p.attempts + 1 >= MAX_ATTEMPTS ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST);
        }
        UUID id = UUID.randomUUID();
        db.sql("INSERT INTO app_users (id, email, password_hash, consent_at, created_at) VALUES (?, ?, ?, ?, ?)")
                .params(id, p.email, p.passwordHash, ts(p.consentAt), ts(clock.instant())).update();
        db.sql("DELETE FROM email_verifications WHERE email = ?").param(p.email).update();
        return new AuthPrincipal(id, p.email, 0);
    }

    public void resend(String rawEmail, UUID challengeId) {
        Pending p = pending(normalize(rawEmail), challengeId);
        int remaining = remaining(p.sentAt);
        if (remaining > 0) throw new AuthException("rate-limited", HttpStatus.TOO_MANY_REQUESTS, remaining);
        String code = newCode();
        Instant now = clock.instant();
        db.sql("UPDATE email_verifications SET code_hash = ?, expires_at = ?, sent_at = ?, attempts = 0 WHERE email = ?")
                .params(passwords.encode(code), ts(now.plus(CODE_TTL)), ts(now), p.email).update();
        sendCode(p.email, code);
    }

    public AuthPrincipal signIn(String rawEmail, String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        }
        var user = db.sql("SELECT * FROM app_users WHERE email = ? FOR UPDATE")
                .param(normalize(rawEmail)).query(User.class).optional();
        if (user.isEmpty()) {
            passwords.matches(password, dummyHash);
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        }
        User u = user.get();
        Instant now = clock.instant();
        if (u.lockedUntil != null && u.lockedUntil.isAfter(now)) {
            throw new AuthException("rate-limited", HttpStatus.TOO_MANY_REQUESTS,
                    (int) Duration.between(now, u.lockedUntil).toSeconds() + 1);
        }
        if (!passwords.matches(password, u.passwordHash)) {
            int attempts = u.lockedUntil != null ? 1 : u.failedLogins + 1;
            db.sql("UPDATE app_users SET failed_logins = ?, locked_until = ? WHERE id = ?")
                    .param(attempts).param(attempts >= MAX_ATTEMPTS ? ts(now.plus(LOGIN_LOCK)) : null)
                    .param(u.id).update();
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        }
        db.sql("UPDATE app_users SET failed_logins = 0, locked_until = NULL WHERE id = ?").param(u.id).update();
        return new AuthPrincipal(u.id, u.email, u.credentialsVersion);
    }

    public void requestReset(String rawEmail) {
        String email = normalize(rawEmail);
        var found = db.sql("SELECT * FROM app_users WHERE email = ? FOR UPDATE").param(email).query(User.class).optional();
        if (found.isEmpty()) return;
        User u = found.get();
        if (u.resetSentAt != null && remaining(u.resetSentAt) > 0) return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        db.sql("UPDATE app_users SET reset_token_hash = ?, reset_expires_at = ?, reset_sent_at = ? WHERE id = ?")
                .params(sha256(token), ts(now.plus(RESET_TTL)), ts(now), u.id).update();
        // Fragment is read by the UI, not sent to HTTP servers or in Referer headers.
        send(email, "GoDeck: восстановление пароля", "Задайте новый пароль по ссылке:\n"
                + frontendUrl + "/auth/reset/#token=" + token
                + "\n\nСсылка действует 30 минут и может быть использована один раз."
                + "\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо.");
    }

    public void resetPassword(String token, String password) {
        checkPassword(password);
        var found = db.sql("SELECT * FROM app_users WHERE reset_token_hash = ? FOR UPDATE")
                .param(sha256(token)).query(User.class).optional();
        if (found.isEmpty() || found.get().resetExpiresAt == null || !found.get().resetExpiresAt.isAfter(clock.instant())) {
            throw new AuthException("expired-code", HttpStatus.BAD_REQUEST);
        }
        db.sql("""
                UPDATE app_users SET password_hash = ?, credentials_version = credentials_version + 1,
                  reset_token_hash = NULL, reset_expires_at = NULL, failed_logins = 0, locked_until = NULL
                WHERE id = ?
                """).params(passwords.encode(password), found.get().id).update();
    }

    @Transactional(readOnly = true)
    public boolean sessionValid(AuthPrincipal principal) {
        return db.sql("SELECT count(*) FROM app_users WHERE id = ? AND credentials_version = ?")
                .params(principal.id(), principal.credentialsVersion()).query(Integer.class).single() == 1;
    }

    private Pending pending(String email, UUID challengeId) {
        if (challengeId == null) throw new AuthException("invalid-code", HttpStatus.BAD_REQUEST);
        return db.sql("SELECT * FROM email_verifications WHERE email = ? AND challenge_id = ? FOR UPDATE")
                .params(email, challengeId).query(Pending.class).optional()
                .orElseThrow(() -> new AuthException("invalid-code", HttpStatus.BAD_REQUEST));
    }

    private int remaining(Instant sentAt) {
        long millis = Duration.between(clock.instant(), sentAt.plusSeconds(COOLDOWN)).toMillis();
        return (int) Math.max(0, (millis + 999) / 1000);
    }

    private Map<String, Integer> challenge(Instant sentAt) {
        return Map.of("codeLength", 6, "resendAfterSeconds", remaining(sentAt));
    }

    private void checkPassword(String password) {
        if (password.length() < 8 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new AuthException("invalid-input", HttpStatus.BAD_REQUEST);
        }
    }

    private String newCode() { return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000)); }
    private static Timestamp ts(Instant value) { return Timestamp.from(value); }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private void sendCode(String email, String code) {
        send(email, "GoDeck: подтверждение почты", "Код подтверждения: " + code
                + "\n\nКод действует 10 минут. Никому его не сообщайте."
                + "\nЕсли вы не регистрировались в GoDeck, проигнорируйте письмо.");
    }

    private void send(String email, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(subject);
        message.setText(body);
        mail.send(message);
    }

    record Pending(String email, UUID challengeId, String passwordHash, String codeHash,
                   Instant consentAt, Instant expiresAt, Instant sentAt, int attempts) {}
    record User(UUID id, String email, String passwordHash, Instant consentAt, Instant createdAt,
                int credentialsVersion, int failedLogins, Instant lockedUntil,
                String resetTokenHash, Instant resetExpiresAt, Instant resetSentAt) {}
}
