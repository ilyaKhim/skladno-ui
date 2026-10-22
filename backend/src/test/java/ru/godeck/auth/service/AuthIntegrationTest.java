package ru.godeck.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Map;
import java.util.regex.Pattern;

@SpringBootTest(
        properties = {
            "godeck.generation.enabled=false",
            "spring.datasource.url=${TEST_DATABASE_URL:jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test}",
            "spring.datasource.hikari.schema=auth_test",
            "spring.flyway.default-schema=auth_test",
            "spring.flyway.schemas=auth_test"
        })
@AutoConfigureMockMvc
@Import(AuthIntegrationTest.TestBeans.class)
class AuthIntegrationTest {
    private static final String EMAIL = "person@example.test";
    private static final String PASSWORD = "a-real-password";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired TestClock clock;
    @Autowired Outbox mail;

    @BeforeEach
    void clean() {
        db.update("DELETE FROM email_verifications");
        db.update("DELETE FROM app_users");
        clock.now = clock.now.plus(Duration.ofDays(1));
        mail.messages.clear();
        mail.fail = false;
    }

    @Test
    void registrationVerificationLoginAndLogout() throws Exception {
        postJson("identify", Map.of("email", "PERSON@example.test"), null)
                .andExpect(jsonPath("$.data.step").value("create-password"));
        MockHttpSession pending = register();
        assertThat(db.queryForObject("SELECT count(*) FROM app_users", Integer.class)).isZero();
        String storedHash =
                db.queryForObject("SELECT password_hash FROM email_verifications", String.class);
        assertThat(storedHash).startsWith("$2a$").isNotEqualTo(PASSWORD);
        postJson("identify", Map.of("email", EMAIL), pending)
                .andExpect(jsonPath("$.data.step").value("verify"));
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isUnauthorized());
        MockHttpSession signedIn =
                session(
                        postJson("verify-email", Map.of("email", EMAIL, "code", code()), pending)
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.data.signedIn").value(true)));
        assertThat(signedIn.getId()).isNotEqualTo(pending.getId());
        mvc.perform(get("/api/auth/me").session(signedIn))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(EMAIL));
        postJson("sign-out", Map.of(), signedIn).andExpect(status().isOk());
        assertThat(signedIn.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        postJson("identify", Map.of("email", EMAIL), null)
                .andExpect(jsonPath("$.data.step").value("password"));
        postJson("sign-in", Map.of("email", "PERSON@example.test", "password", PASSWORD), null)
                .andExpect(status().isOk());
    }

    @Test
    void verificationCannotBeUsedFromAnotherRegistrationSessionOrReplayed() throws Exception {
        MockHttpSession owner = register();
        String code = code();
        postJson("verify-email", Map.of("email", EMAIL, "code", code), new MockHttpSession())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid-code"));
        postJson("identify", Map.of("email", EMAIL), null)
                .andExpect(jsonPath("$.data.step").value("create-password"));
        MockHttpSession signedIn =
                session(
                        postJson("verify-email", Map.of("email", EMAIL, "code", code), owner)
                                .andExpect(status().isOk()));
        postJson("verify-email", Map.of("email", EMAIL, "code", code), signedIn)
                .andExpect(status().isBadRequest());
        assertThat(db.queryForObject("SELECT count(*) FROM app_users", Integer.class)).isEqualTo(1);
    }

    @Test
    void badCodesPersistAttemptLimitAndResendHasCooldown() throws Exception {
        MockHttpSession pending = register();
        String valid = code();
        String wrong = valid.equals("000000") ? "000001" : "000000";
        postJson("resend-code", Map.of("email", EMAIL), pending)
                .andExpect(status().isTooManyRequests());
        for (int i = 0; i < 4; i++) {
            postJson("verify-email", Map.of("email", EMAIL, "code", wrong), pending)
                    .andExpect(status().isBadRequest());
        }
        postJson("verify-email", Map.of("email", EMAIL, "code", wrong), pending)
                .andExpect(status().isTooManyRequests());
        postJson("verify-email", Map.of("email", EMAIL, "code", valid), pending)
                .andExpect(status().isTooManyRequests());
        assertThat(db.queryForObject("SELECT attempts FROM email_verifications", Integer.class))
                .isEqualTo(5);
        clock.now = clock.now.plusSeconds(61);
        postJson("resend-code", Map.of("email", EMAIL), pending).andExpect(status().isOk());
        postJson("verify-email", Map.of("email", EMAIL, "code", code()), pending)
                .andExpect(status().isOk());
    }

    @Test
    void expiredCodeCanBeReplacedAndNewCodeWorks() throws Exception {
        MockHttpSession pending = register();
        clock.now = clock.now.plus(Duration.ofMinutes(11));
        postJson("identify", Map.of("email", EMAIL), pending)
                .andExpect(jsonPath("$.data.challenge.resendAfterSeconds").value(0));
        postJson("verify-email", Map.of("email", EMAIL, "code", code()), pending)
                .andExpect(jsonPath("$.error").value("expired-code"));
        postJson("resend-code", Map.of("email", EMAIL), pending).andExpect(status().isOk());
        postJson("verify-email", Map.of("email", EMAIL, "code", code()), pending)
                .andExpect(status().isOk());
    }

    @Test
    void resetIsSingleUseInvalidatesSessionsAndChangesPassword() throws Exception {
        MockHttpSession account = verifiedAccount();
        postJson("request-password-reset", Map.of("email", EMAIL), null).andExpect(status().isOk());
        String token = resetToken();
        postJson("reset-password", Map.of("token", token, "password", "new-secure-password"), null)
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(account)).andExpect(status().isUnauthorized());
        postJson("reset-password", Map.of("token", token, "password", PASSWORD), null)
                .andExpect(status().isBadRequest());
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isUnauthorized());
        postJson("sign-in", Map.of("email", EMAIL, "password", "new-secure-password"), null)
                .andExpect(status().isOk());
    }

    @Test
    void resetExpiresAndDoesNotRevealUnknownEmail() throws Exception {
        verifiedAccount();
        var unknown =
                postJson("request-password-reset", Map.of("email", "unknown@example.test"), null)
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        var known =
                postJson("request-password-reset", Map.of("email", EMAIL), null)
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertThat(known).isEqualTo(unknown);
        String token = resetToken();
        clock.now = clock.now.plus(Duration.ofMinutes(31));
        postJson("reset-password", Map.of("token", token, "password", "new-password"), null)
                .andExpect(status().isBadRequest());
        mail.fail = true;
        postJson("request-password-reset", Map.of("email", EMAIL), null)
                .andExpect(status().isOk())
                .andExpect(content().json(unknown));
    }

    @Test
    void wrongPasswordsLockAccountTemporarily() throws Exception {
        verifiedAccount();
        for (int i = 0; i < 5; i++) {
            postJson("sign-in", Map.of("email", EMAIL, "password", "wrong-password"), null)
                    .andExpect(status().isUnauthorized());
        }
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isTooManyRequests());
        clock.now = clock.now.plus(Duration.ofMinutes(16));
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isOk());
    }

    @Test
    void validationCsrfAndMailFailureDoNotCreateAccounts() throws Exception {
        mvc.perform(
                        post("/api/auth/register")
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                Map.of(
                                                        "email",
                                                        EMAIL,
                                                        "password",
                                                        PASSWORD,
                                                        "consentAccepted",
                                                        true))))
                .andExpect(status().isForbidden());
        postJson(
                        "register",
                        Map.of("email", EMAIL, "password", PASSWORD, "consentAccepted", false),
                        null)
                .andExpect(status().isBadRequest());
        postJson(
                        "register",
                        Map.of("email", EMAIL, "password", "short", "consentAccepted", true),
                        null)
                .andExpect(status().isBadRequest());
        postJson(
                        "register",
                        Map.of("email", EMAIL, "password", "я".repeat(40), "consentAccepted", true),
                        null)
                .andExpect(status().isBadRequest());
        postJson("sign-in", Map.of("email", EMAIL, "password", "я".repeat(40)), null)
                .andExpect(status().isUnauthorized());
        mail.fail = true;
        postJson(
                        "register",
                        Map.of("email", EMAIL, "password", PASSWORD, "consentAccepted", true),
                        null)
                .andExpect(status().isServiceUnavailable());
        assertThat(db.queryForObject("SELECT count(*) FROM email_verifications", Integer.class))
                .isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM app_users", Integer.class)).isZero();
    }

    @Test
    void verifiedAccountCannotBeOverwrittenByRegistration() throws Exception {
        verifiedAccount();
        postJson(
                        "register",
                        Map.of(
                                "email",
                                EMAIL,
                                "password",
                                "another-password",
                                "consentAccepted",
                                true),
                        null)
                .andExpect(status().isConflict());
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isOk());
    }

    @Test
    void authRequestsAreRateLimitedPerRemoteAddress() throws Exception {
        for (int i = 0; i < 100; i++) {
            postJson("identify", Map.of("email", EMAIL), null).andExpect(status().isOk());
        }
        postJson("identify", Map.of("email", EMAIL), null).andExpect(status().isTooManyRequests());
    }

    @Test
    void simultaneousRegistrationsRespectCooldownAtomically() throws Exception {
        var gate = new java.util.concurrent.CountDownLatch(1);
        java.util.function.Supplier<Integer> register =
                () -> {
                    try {
                        gate.await();
                        return postJson(
                                        "register",
                                        Map.of(
                                                "email",
                                                EMAIL,
                                                "password",
                                                PASSWORD,
                                                "consentAccepted",
                                                true),
                                        null)
                                .andReturn()
                                .getResponse()
                                .getStatus();
                    } catch (Exception error) {
                        throw new IllegalStateException(error);
                    }
                };
        var first = java.util.concurrent.CompletableFuture.supplyAsync(register);
        var second = java.util.concurrent.CompletableFuture.supplyAsync(register);
        gate.countDown();
        assertThat(
                        java.util.List.of(
                                first.get(10, java.util.concurrent.TimeUnit.SECONDS),
                                second.get(10, java.util.concurrent.TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 429);
        assertThat(db.queryForObject("SELECT count(*) FROM email_verifications", Integer.class))
                .isEqualTo(1);
        assertThat(mail.messages).hasSize(1);
    }

    @Test
    void failedResendRollsBackManagedEntityChangesAndKeepsOldCodeValid() throws Exception {
        MockHttpSession session = register();
        String originalCode = code();
        clock.now = clock.now.plusSeconds(61);
        mail.fail = true;
        postJson("resend-code", Map.of("email", EMAIL), session)
                .andExpect(status().isServiceUnavailable());
        mail.fail = false;
        postJson("verify-email", Map.of("email", EMAIL, "code", originalCode), session)
                .andExpect(status().isOk());
    }

    @Test
    void registrationAfterCooldownReplacesChallengeCodeAndPassword() throws Exception {
        MockHttpSession oldSession = register();
        clock.now = clock.now.plusSeconds(60);
        String replacementPassword = "replacement-password";
        MockHttpSession newSession =
                session(
                        postJson(
                                        "register",
                                        Map.of(
                                                "email",
                                                EMAIL,
                                                "password",
                                                replacementPassword,
                                                "consentAccepted",
                                                true),
                                        null)
                                .andExpect(status().isOk()));
        String newCode = code();
        assertThat(mail.messages).hasSize(2);
        assertThat(db.queryForObject("SELECT count(*) FROM email_verifications", Integer.class))
                .isEqualTo(1);
        postJson("verify-email", Map.of("email", EMAIL, "code", newCode), oldSession)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid-code"));
        postJson("verify-email", Map.of("email", EMAIL, "code", newCode), newSession)
                .andExpect(status().isOk());
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isUnauthorized());
        postJson("sign-in", Map.of("email", EMAIL, "password", replacementPassword), null)
                .andExpect(status().isOk());
    }

    @Test
    void failedRegistrationUpdateKeepsOriginalChallengeCodeAndPassword() throws Exception {
        MockHttpSession oldSession = register();
        String oldCode = code();
        clock.now = clock.now.plusSeconds(60);
        mail.fail = true;
        postJson(
                        "register",
                        Map.of(
                                "email",
                                EMAIL,
                                "password",
                                "replacement-password",
                                "consentAccepted",
                                true),
                        null)
                .andExpect(status().isServiceUnavailable());
        mail.fail = false;
        assertThat(mail.messages).hasSize(1);
        postJson("verify-email", Map.of("email", EMAIL, "code", oldCode), oldSession)
                .andExpect(status().isOk());
        postJson("sign-in", Map.of("email", EMAIL, "password", PASSWORD), null)
                .andExpect(status().isOk());
    }

    private MockHttpSession register() throws Exception {
        return session(
                postJson(
                                "register",
                                Map.of(
                                        "email",
                                        EMAIL,
                                        "password",
                                        PASSWORD,
                                        "consentAccepted",
                                        true),
                                null)
                        .andExpect(status().isOk()));
    }

    private MockHttpSession verifiedAccount() throws Exception {
        MockHttpSession session = register();
        return session(
                postJson("verify-email", Map.of("email", EMAIL, "code", code()), session)
                        .andExpect(status().isOk()));
    }

    private String code() {
        var match = Pattern.compile("[0-9]{6}").matcher(mail.messages.getLast().getText());
        assertThat(match.find()).isTrue();
        return match.group();
    }

    private String resetToken() {
        var match =
                Pattern.compile("#token=([A-Za-z0-9_-]{43})")
                        .matcher(mail.messages.getLast().getText());
        assertThat(match.find()).isTrue();
        return match.group(1);
    }

    private MockHttpSession session(ResultActions result) throws Exception {
        return (MockHttpSession) result.andReturn().getRequest().getSession(false);
    }

    private ResultActions postJson(String path, Object body, MockHttpSession session)
            throws Exception {
        MockHttpServletRequestBuilder request =
                post("/api/auth/" + path)
                        .with(csrf())
                        .contentType("application/json")
                        .content(json.writeValueAsString(body));
        if (session != null) request.session(session);
        return mvc.perform(request);
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        TestClock testClock() {
            return new TestClock();
        }

        @Bean
        @Primary
        Outbox outbox() {
            return new Outbox();
        }
    }

    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-10-19T10:00:00Z");

        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        public Clock withZone(ZoneId zone) {
            return this;
        }

        public Instant instant() {
            return now;
        }
    }

    static class Outbox extends JavaMailSenderImpl {
        final ArrayList<SimpleMailMessage> messages = new ArrayList<>();
        boolean fail;

        @Override
        public void send(SimpleMailMessage message) {
            if (fail) throw new MailSendException("Test SMTP outage");
            messages.add(new SimpleMailMessage(message));
        }
    }
}
