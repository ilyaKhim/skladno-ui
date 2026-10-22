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

    @GetMapping("/csrf")
    public Map<String, Object> csrf(CsrfToken token) {
        return ok(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }

    @PostMapping("/identify")
    public Map<String, Object> identify(
            @Valid @RequestBody EmailInput input, HttpServletRequest request) {
        return ok(service.identify(input.email(), challengeId(request)));
    }

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

    @PostMapping("/verify-email")
    public Map<String, Object> verify(
            @Valid @RequestBody VerifyInput input,
            HttpServletRequest request,
            HttpServletResponse response) {
        AuthPrincipal principal = service.verify(input.email(), input.code(), challengeId(request));
        startSession(principal, request, response);
        return ok(Map.of("signedIn", true));
    }

    @PostMapping("/resend-code")
    public Map<String, Object> resend(
            @Valid @RequestBody EmailInput input, HttpServletRequest request) {
        service.resend(input.email(), challengeId(request));
        return ok(Map.of("resendAfterSeconds", AuthPolicy.RESEND_COOLDOWN_SECONDS));
    }

    @PostMapping("/sign-in")
    public Map<String, Object> signIn(
            @Valid @RequestBody LoginInput input,
            HttpServletRequest request,
            HttpServletResponse response) {
        startSession(service.signIn(input.email(), input.password()), request, response);
        return ok(Map.of());
    }

    @PostMapping("/request-password-reset")
    public Map<String, Object> requestReset(@Valid @RequestBody EmailInput input) {
        service.requestReset(input.email());
        return ok(Map.of());
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(
            @Valid @RequestBody ResetInput input, HttpServletRequest request) {
        service.resetPassword(input.token(), input.password());
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        var user = (AuthPrincipal) authentication.getPrincipal();
        return ok(Map.of("id", user.id(), "email", user.email()));
    }

    @PostMapping("/sign-out")
    public Map<String, Object> signOut(HttpServletRequest request) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    private UUID challengeId(HttpServletRequest request) {
        var session = request.getSession(false);
        return session == null
                ? null
                : (UUID) session.getAttribute(REGISTRATION_CHALLENGE_SESSION_KEY);
    }

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

    public static Map<String, Object> ok(Object data) {
        return Map.of("ok", true, "data", data);
    }
}
