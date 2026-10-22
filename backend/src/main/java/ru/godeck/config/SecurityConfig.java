package ru.godeck.config;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

import ru.godeck.auth.AuthService;

import java.io.IOException;
import java.time.Clock;

@Configuration
class SecurityConfig {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

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
            throw new IllegalStateException(
                    "AUTH_BYPASS is allowed only when SERVER_ADDRESS is loopback.");
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
                                                        error(res, 401, "invalid-credentials"))
                                        .accessDeniedHandler(
                                                (req, res, ex) -> error(res, 403, "invalid-input")))
                .addFilterBefore(
                        new SessionSecurityFilter(service, clock, devBypass),
                        AuthorizationFilter.class)
                .build();
    }

    private static void error(HttpServletResponse response, int status, String code)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"ok\":false,\"error\":\"" + code + "\"}");
    }
}
