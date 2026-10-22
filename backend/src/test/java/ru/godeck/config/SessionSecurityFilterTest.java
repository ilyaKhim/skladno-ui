package ru.godeck.config;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.auth.service.AuthService;
import ru.godeck.common.security.SecurityPolicy;

import java.time.*;
import java.util.UUID;

class SessionSecurityFilterTest {
    private static final Instant NOW = Instant.parse("2026-10-22T12:00:00Z");
    private final AuthService service = mock(AuthService.class);
    private final Clock clock = mock(Clock.class);
    private SessionSecurityFilter filter;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        when(clock.instant()).thenReturn(NOW);
        filter = new SessionSecurityFilter(service, clock, false);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void requestWindowResetsAtItsExactDeadline() throws Exception {
        for (int n = 0; n < SecurityPolicy.MAX_AUTH_REQUESTS_PER_WINDOW; n++)
            assertThat(request("POST", "/api/auth/identify", "127.0.0.1", null).getStatus())
                    .isEqualTo(200);
        assertThat(request("POST", "/api/auth/identify", "127.0.0.1", null).getStatus())
                .isEqualTo(429);
        when(clock.instant()).thenReturn(NOW.plus(SecurityPolicy.AUTH_REQUEST_WINDOW));
        assertThat(request("POST", "/api/auth/identify", "127.0.0.1", null).getStatus())
                .isEqualTo(200);
    }

    @Test
    void forwardedHeadersCannotBypassRemoteAddressLimit() throws Exception {
        for (int n = 0; n < SecurityPolicy.MAX_AUTH_REQUESTS_PER_WINDOW; n++)
            request("POST", "/api/auth/identify", "127.0.0.1", "forged-" + n);
        assertThat(request("POST", "/api/auth/identify", "127.0.0.1", "new-forged").getStatus())
                .isEqualTo(429);
        assertThat(request("POST", "/api/auth/identify", "127.0.0.2", "new-forged").getStatus())
                .isEqualTo(200);
        assertThat(request("GET", "/api/auth/csrf", "127.0.0.1", null).getStatus()).isEqualTo(200);
    }

    @Test
    void staleSessionIsInvalidatedBeforeAuthorization() throws Exception {
        var principal = authenticate();
        when(service.sessionValid(principal)).thenReturn(false);
        var request = new MockHttpServletRequest("GET", "/api/auth/me");
        var session = (MockHttpSession) request.getSession();
        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        assertThat(session.isInvalid()).isTrue();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void validSessionKeepsItsPrincipal() throws Exception {
        var principal = authenticate();
        when(service.sessionValid(principal)).thenReturn(true);
        request("GET", "/api/auth/me", "127.0.0.1", null);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isEqualTo(principal);
    }

    @Test
    void debugModeUsesStablePrincipalWithoutDatabaseLookupOrSessionCreation() throws Exception {
        filter = new SessionSecurityFilter(service, clock, true);
        var request = new MockHttpServletRequest("GET", "/api/auth/me");
        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(((AuthPrincipal) auth.getPrincipal()).email()).isEqualTo("debug@godeck.local");
        assertThat(auth.getAuthorities())
                .extracting("authority")
                .containsExactly(SecurityPolicy.USER_AUTHORITY);
        assertThat(request.getSession(false)).isNull();
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.0.0.0", "::", "192.0.2.1"})
    void debugBypassRefusesNonLoopbackBinding(String address) {
        var http = mock(HttpSecurity.class);
        assertThatThrownBy(() -> new SecurityConfig().security(http, service, clock, true, address))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AUTH_BYPASS");
        verifyNoInteractions(http, service);
    }

    private AuthPrincipal authenticate() {
        var principal = new AuthPrincipal(UUID.randomUUID(), "person@example.test", 0);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated(
                                principal,
                                null,
                                AuthorityUtils.createAuthorityList(SecurityPolicy.USER_AUTHORITY)));
        return principal;
    }

    private MockHttpServletResponse request(String method, String uri, String ip, String forwarded)
            throws Exception {
        var request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr(ip);
        if (forwarded != null) request.addHeader("X-Forwarded-For", forwarded);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
