package ru.godeck.config;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

import ru.godeck.auth.exception.AuthError;
import ru.godeck.auth.service.AuthService;

import java.io.IOException;
import java.time.Clock;

/**
 * Defines password hashing, UTC time, session security, CSRF, and endpoint authorization policy.
 * Authentication is deliberately session-based: the browser stores only the session cookie while
 * Spring persists the principal and CSRF state server-side.
 */
@Configuration
class SecurityConfig {
    private static final String UNSAFE_BYPASS_BINDING =
            "AUTH_BYPASS is allowed only when SERVER_ADDRESS is loopback.";

    /** Supplies one UTC clock so expiry and lockout logic can be deterministic in tests. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    /** Supplies BCrypt as the one-way encoder for passwords and short-lived verification codes. */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Builds the single application security chain.
     *
     * <p>Only authentication bootstrap endpoints are anonymous; all application endpoints require a
     * current session. CSRF remains enabled for both anonymous state changes and authenticated API
     * calls. The development bypass is rejected unless the server itself is loopback-bound.
     */
    @Bean
    SecurityFilterChain security(
            HttpSecurity http,
            AuthService service,
            Clock clock,
            @Value("${godeck.auth.dev-bypass:false}") boolean devBypass,
            @Value("${server.address:127.0.0.1}") String address)
            throws Exception {
        if (devBypass
                && !address.equals("localhost")
                && !address.equals("127.0.0.1")
                && !address.equals("::1")) {
            throw new IllegalStateException(UNSAFE_BYPASS_BINDING);
        }
        return http.formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .securityContext(
                        c ->
                                c.securityContextRepository(
                                        new HttpSessionSecurityContextRepository()))
                // CSRF remains session-backed for registration, sign-in, and the application API.
                .authorizeHttpRequests(
                        a ->
                                a.requestMatchers("/api/auth/me")
                                        .authenticated()
                                        .requestMatchers("/api/auth/**", "/error")
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        e ->
                                e.authenticationEntryPoint(
                                                (req, res, ex) ->
                                                        error(
                                                                res,
                                                                HttpStatus.UNAUTHORIZED,
                                                                AuthError.INVALID_CREDENTIALS))
                                        .accessDeniedHandler(
                                                (req, res, ex) ->
                                                        error(
                                                                res,
                                                                HttpStatus.FORBIDDEN,
                                                                AuthError.INVALID_INPUT)))
                .addFilterBefore(
                        new SessionSecurityFilter(service, clock, devBypass),
                        AuthorizationFilter.class)
                .build();
    }

    /** Writes stable JSON errors for failures that occur inside Spring Security, before MVC. */
    private static void error(HttpServletResponse response, HttpStatus status, AuthError error)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"ok\":false,\"error\":\"" + error.code() + "\"}");
    }
}
