package ru.godeck;

import java.util.Map;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final String CHALLENGE = "registrationChallenge";
    private final AuthService service;
    private final HttpSessionSecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    public AuthController(AuthService service) { this.service = service; }

    @GetMapping("/csrf")
    Map<String, Object> csrf(CsrfToken token) {
        return ok(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }

    @PostMapping("/identify")
    Map<String, Object> identify(@Valid @RequestBody EmailInput input, HttpServletRequest request) {
        return ok(service.identify(input.email(), challengeId(request)));
    }

    @PostMapping("/register")
    Map<String, Object> register(@Valid @RequestBody RegisterInput input, HttpServletRequest request) {
        UUID challenge = service.register(input.email(), input.password());
        request.getSession().setAttribute(CHALLENGE, challenge);
        return ok(Map.of("challenge", Map.of("codeLength", 6, "resendAfterSeconds", 60)));
    }

    @PostMapping("/verify-email")
    Map<String, Object> verify(@Valid @RequestBody VerifyInput input, HttpServletRequest request, HttpServletResponse response) {
        AuthPrincipal principal = service.verify(input.email(), input.code(), challengeId(request));
        startSession(principal, request, response);
        return ok(Map.of("signedIn", true));
    }

    @PostMapping("/resend-code")
    Map<String, Object> resend(@Valid @RequestBody EmailInput input, HttpServletRequest request) {
        service.resend(input.email(), challengeId(request));
        return ok(Map.of("resendAfterSeconds", 60));
    }

    @PostMapping("/sign-in")
    Map<String, Object> signIn(@Valid @RequestBody LoginInput input, HttpServletRequest request, HttpServletResponse response) {
        startSession(service.signIn(input.email(), input.password()), request, response);
        return ok(Map.of());
    }

    @PostMapping("/request-password-reset")
    Map<String, Object> requestReset(@Valid @RequestBody EmailInput input) {
        service.requestReset(input.email());
        return ok(Map.of());
    }

    @PostMapping("/reset-password")
    Map<String, Object> resetPassword(@Valid @RequestBody ResetInput input, HttpServletRequest request) {
        service.resetPassword(input.token(), input.password());
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    @GetMapping("/me")
    Map<String, Object> me(Authentication authentication) {
        var user = (AuthPrincipal) authentication.getPrincipal();
        return ok(Map.of("id", user.id(), "email", user.email()));
    }

    @PostMapping("/sign-out")
    Map<String, Object> signOut(HttpServletRequest request) {
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        SecurityContextHolder.clearContext();
        return ok(Map.of());
    }

    private UUID challengeId(HttpServletRequest request) {
        var session = request.getSession(false);
        return session == null ? null : (UUID) session.getAttribute(CHALLENGE);
    }

    private void startSession(AuthPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        // Replacing the session prevents fixation and drops registration/CSRF state.
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        request.getSession(true);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                AuthorityUtils.createAuthorityList("ROLE_USER")));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }

    static Map<String, Object> ok(Object data) { return Map.of("ok", true, "data", data); }

    public record EmailInput(@NotBlank @Email @Size(max = 254) String email) {}
    public record LoginInput(@NotBlank @Email @Size(max = 254) String email,
                             @NotBlank @Size(max = 72) String password) {}
    public record RegisterInput(@NotBlank @Email @Size(max = 254) String email,
                                @NotBlank @Size(min = 8, max = 72) String password,
                                @AssertTrue boolean consentAccepted) {}
    public record VerifyInput(@NotBlank @Email @Size(max = 254) String email,
                              @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {}
    public record ResetInput(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
                             @NotBlank @Size(min = 8, max = 72) String password) {}
}
