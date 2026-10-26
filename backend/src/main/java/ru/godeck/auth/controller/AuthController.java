package ru.godeck.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ru.godeck.auth.dto.EmailInput;
import ru.godeck.auth.dto.LoginInput;
import ru.godeck.auth.dto.RegisterInput;
import ru.godeck.auth.dto.ResetInput;
import ru.godeck.auth.dto.VerificationChallenge;
import ru.godeck.auth.dto.VerifyInput;
import ru.godeck.auth.policy.AuthPolicy;
import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.auth.service.AuthService;
import ru.godeck.common.security.SecurityPolicy;

import java.util.Map;
import java.util.UUID;

/**
 * HTTP/session adapter for the email-and-password authentication flow.
 *
 * <p>The controller keeps browser-specific concerns here: CSRF discovery, registration challenge
 * ids in the temporary session, session rotation after authentication, and the common API envelope.
 * Credential rules and rate/attempt decisions remain in {@link AuthService}.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final String REGISTRATION_CHALLENGE_SESSION_KEY = "registrationChallenge";
    private final AuthService service;
    private final HttpSessionSecurityContextRepository contexts =
            new HttpSessionSecurityContextRepository();

    public AuthController(AuthService service) {
        this.service = service;
    }

    /** Supplies the session-backed CSRF token and header name required by unsafe requests. */
    @GetMapping("/csrf")
    public Map<String, Object> csrf(CsrfToken token) {
        return ok(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }

    /**
     * Chooses the next UI step without revealing more account state than the flow requires.
     * The session challenge reconnects a browser to its pending registration.
     */
    @PostMapping("/identify")
    public Map<String, Object> identify(
            @Valid @RequestBody EmailInput input, HttpServletRequest request) {
        return ok(service.identify(input.email(), challengeId(request)));
    }

    /** Starts registration and stores the opaque challenge id only in the browser session. */
    @PostMapping("/register")
    public Map<String, Object> register(
            @Valid @RequestBody RegisterInput input, HttpServletRequest request) {
        UUID challenge = service.register(input.email(), input.password());
        request.getSession().setAttribute(REGISTRATION_CHALLENGE_SESSION_KEY, challenge);
        return ok(
                Map.of(
                        "challenge",
                        VerificationChallenge.after(AuthPolicy.RESEND_COOLDOWN_SECONDS)));
    }

    /** Verifies the email code, rotates the session, and signs the newly created account in. */
    @PostMapping("/verify-email")
    public Map<String, Object> verify(
            @Valid @RequestBody VerifyInput input,
            HttpServletRequest request,
            HttpServletResponse response) {
        AuthPrincipal principal = service.verify(input.email(), input.code(), challengeId(request));
        startSession(principal, request, response);
        return ok(Map.of("signedIn", true));
    }

    /** Reissues a verification code for the pending registration bound to this session. */
    @PostMapping("/resend-code")
    public Map<String, Object> resend(
            @Valid @RequestBody EmailInput input, HttpServletRequest request) {
        service.resend(input.email(), challengeId(request));
        return ok(Map.of("resendAfterSeconds", AuthPolicy.RESEND_COOLDOWN_SECONDS));
    }

    /** Authenticates credentials and starts a fixation-resistant server-side session. */
    @PostMapping("/sign-in")
    public Map<String, Object> signIn(
            @Valid @RequestBody LoginInput input,
            HttpServletRequest request,
            HttpServletResponse response) {
        startSession(service.signIn(input.email(), input.password()), request, response);
        return ok(Map.of());
    }

    /**
     * Requests reset delivery while keeping the response identical for existing and absent users.
     */
    @PostMapping("/request-password-reset")
    public Map<String, Object> requestReset(@Valid @RequestBody EmailInput input) {
        service.requestReset(input.email());
        return ok(Map.of());
    }

    /** Consumes a reset token, changes credentials, and invalidates any current browser session. */
    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(
            @Valid @RequestBody ResetInput input, HttpServletRequest request) {
        service.resetPassword(input.token(), input.password());
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    /** Returns the authenticated principal used by the frontend bootstrap. */
    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        var user = (AuthPrincipal) authentication.getPrincipal();
        return ok(Map.of("id", user.id(), "email", user.email()));
    }

    /** Invalidates server-side session state and clears the current security context. */
    @PostMapping("/sign-out")
    public Map<String, Object> signOut(HttpServletRequest request) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    /** Reads the opaque registration challenge without creating an unnecessary session. */
    private UUID challengeId(HttpServletRequest request) {
        var session = request.getSession(false);
        return session == null
                ? null
                : (UUID) session.getAttribute(REGISTRATION_CHALLENGE_SESSION_KEY);
    }

    /**
     * Replaces any pre-authentication session before persisting the authenticated security context.
     * Rotation prevents session fixation and also drops registration and old CSRF state.
     */
    private void startSession(
            AuthPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        // Replacing the session prevents fixation and drops registration/CSRF state.
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        request.getSession(true);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        principal,
                        null,
                        AuthorityUtils.createAuthorityList(SecurityPolicy.USER_AUTHORITY)));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }

    /** Wraps successful auth responses in the API's stable envelope. */
    public static Map<String, Object> ok(Object data) {
        return Map.of("ok", true, "data", data);
    }
}
