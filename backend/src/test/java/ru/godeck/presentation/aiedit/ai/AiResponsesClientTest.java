package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.ai.AiCallContext;
import ru.godeck.presentation.ai.AiOperation;
import ru.godeck.presentation.ai.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

class AiResponsesClientTest {
    private static final String URL = "http://ai-fixture.invalid/responses";
    private static final String KEY = "test-only-provider-key";
    private final RestClient.Builder transport = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(transport).build();
    private final PresentationAiCallHistory history = mock(PresentationAiCallHistory.class);
    private final ObjectMapper json = new ObjectMapper();
    private final AiCallContext context = new AiCallContext(UUID.randomUUID(), AiOperation.TEXT_EDIT);
    private final UUID callId = UUID.randomUUID();
    private final AiResponsesClient client = new AiResponsesClient(
            transport.build(), json, history, KEY, true, URL);

    @Test
    void usesTheConfiguredEndpointAndAuditsTheActualExchange() {
        Map<String, Object> request = Map.of("model", "gpt-5.4-mini", "input", "Реальный текст");
        String body = json.writeValueAsString(request);
        when(history.start(context, "gpt-5.4-mini", body)).thenReturn(callId);
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + KEY))
                .andExpect(content().string(body))
                .andRespond(withSuccess("{\"status\":\"completed\"}", MediaType.APPLICATION_JSON));

        String response = client.call(context, "gpt-5.4-mini", request, Function.identity());
        assertThat(response).isEqualTo("{\"status\":\"completed\"}");
        verify(history).complete(callId, "{\"status\":\"completed\"}", 200, null, ResponsesUsage.NONE);
        server.verify();
    }

    @Test
    void providerErrorsKeepTheirRealBodyWithOnlyTheKeyMasked() {
        when(history.start(any(), anyString(), anyString())).thenReturn(callId);
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .body("provider error " + KEY));
        assertThatThrownBy(() -> client.call(context, "gpt-5.4-mini", Map.of(), Function.identity()))
                .isInstanceOf(AiGenerationException.class);
        verify(history).complete(callId, "provider error [REDACTED]", 429,
                "ai_edit_failed", ResponsesUsage.NONE);
        server.verify();
    }

    @Test
    void missingAuditPreventsAnyProviderCall() {
        when(history.start(any(), anyString(), anyString())).thenThrow(new IllegalStateException("audit unavailable"));
        assertThatThrownBy(() -> client.call(context, "gpt-5.4-mini", Map.of(), Function.identity()))
                .isInstanceOf(IllegalStateException.class);
        server.verify();
        verify(history, never()).complete(any(), any(), any(), any(), any());
    }
}
