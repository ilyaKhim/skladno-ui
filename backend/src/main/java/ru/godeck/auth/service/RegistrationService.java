package ru.godeck.auth.service;

import static ru.godeck.auth.policy.AuthPolicy.*;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.auth.entity.EmailVerification;
import ru.godeck.auth.exception.AuthError;
import ru.godeck.auth.exception.AuthException;
import ru.godeck.auth.repository.EmailVerificationRepository;
import ru.godeck.auth.repository.UserAccountRepository;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class RegistrationService {
    private final EmailVerificationRepository verifications;
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;
    private final AuthMailService mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public RegistrationService(
            EmailVerificationRepository verifications,
            UserAccountRepository users,
            PasswordEncoder passwords,
            AuthMailService mail,
            Clock clock) {
        this.verifications = verifications;
        this.users = users;
        this.passwords = passwords;
        this.mail = mail;
        this.clock = clock;
    }

    @Transactional
    public UUID register(String email, String password) {
        EmailVerification pending = verifications.findByEmail(email).orElse(null);
        // Check after locking: verification may have just created the account and removed the row.
        if (users.existsByEmail(email)) throw new AuthException(AuthError.EMAIL_ALREADY_REGISTERED);
        Instant now = clock.instant();
        if (pending != null
                && pending.getSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS).isAfter(now)) {
            throw new AuthException(AuthError.RATE_LIMITED, RESEND_COOLDOWN_SECONDS);
        }
        UUID challenge = UUID.randomUUID();
        String code =
                String.format(
                        Locale.ROOT,
                        VERIFICATION_CODE_FORMAT,
                        random.nextInt(VERIFICATION_CODE_BOUND));
        if (pending == null) pending = new EmailVerification(email);
        pending.startRegistration(
                challenge,
                passwords.encode(password),
                passwords.encode(code),
                now,
                now.plus(CODE_TTL));
        // Flush before SMTP: a losing concurrent insert must not send a second code.
        verifications.saveAndFlush(pending);
        mail.sendCode(email, code);
        return challenge;
    }
}
