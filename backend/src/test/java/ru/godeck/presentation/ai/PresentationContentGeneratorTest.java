package ru.godeck.presentation.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.model.GenerationInput;
import ru.godeck.presentation.model.SourceMaterial;
import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

import java.util.*;

class PresentationContentGeneratorTest {
    private static final String URL = "https://api.openai.com/v1/responses";
    private final ObjectMapper json = new ObjectMapper();
    private MockRestServiceServer server;
    private RestClient client;
    private PresentationContentGenerator generator;
    private PresentationAiCallHistory history;
    private final UUID callId = UUID.randomUUID();
    private final AiCallContext context =
            new AiCallContext(UUID.randomUUID(), AiOperation.GENERATION);

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = builder.build();
        history = mock(PresentationAiCallHistory.class);
        when(history.start(any(), anyString(), anyString())).thenReturn(callId);
        generator =
                new PresentationContentGenerator(
                        client,
                        json,
                        new PresentationRequestFactory(),
                        new OpenAiResponseReader(json, new PresentationContentCodec(json)),
                        history,
                        "unit-test-key",
                        true);
    }

    @AfterEach
    void verifyRequests() {
        server.verify();
    }

    @Test
    void sendsStructuredRequestAndReadsTheCompletedPlan() {
        server.expect(requestTo(URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer unit-test-key"))
                .andExpect(jsonPath("$.model").value("gpt-5.4"))
                .andExpect(jsonPath("$.store").value(false))
                .andExpect(jsonPath("$.text.format.strict").value(true))
                .andExpect(jsonPath("$.text.format.schema.additionalProperties").value(false))
                .andRespond(
                        withSuccess(
                                completed(
                                        "{\"fields\":{\"TITLE\":\"Тема\"},\"slides\":[{\"slide\":1,\"include\":true,\"reason\":\"Тема\"}]}"),
                                MediaType.APPLICATION_JSON));
        var content = generate();
        assertThat(content.fields()).containsEntry("TITLE", "Тема");
        assertThat(content.slideCount()).isEqualTo(1);
    }

    @Test
    void sourceAndContextArePreservedInTheActualRequestAndResponseHistory() {
        var input =
                GenerationInput.normalize(
                        "Inform",
                        "Board",
                        new SourceMaterial("txt", "report.txt", "Confidential revenue 42"));
        server.expect(requestTo(URL))
                .andExpect(
                        jsonPath("$.input[1].content")
                                .value(
                                        org.hamcrest.Matchers.containsString(
                                                "Confidential revenue 42")))
                .andExpect(
                        jsonPath("$.input[1].content")
                                .value(org.hamcrest.Matchers.containsString("Board")))
                .andExpect(
                        jsonPath("$.instructions")
                                .value(
                                        org.hamcrest.Matchers.not(
                                                org.hamcrest.Matchers.containsString(
                                                        "Confidential revenue 42"))))
                .andRespond(
                        withSuccess(
                                completed(
                                        "{\"fields\":{\"TITLE\":\"Confidential revenue"
                                                + " 42\"},\"slides\":[]}"),
                                MediaType.APPLICATION_JSON));
        var content =
                generator.generate(
                        context,
                        "Summarize",
                        Map.of("TITLE", 80),
                        List.of(Map.of("slide", 1)),
                        "gpt-5.4",
                        input);
        assertThat(content.fields()).containsEntry("TITLE", "Confidential revenue 42");
        var request = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(history).start(eq(context), eq("gpt-5.4"), request.capture());
        assertThat(request.getValue())
                .isEqualTo(
                        json.writeValueAsString(
                                generator.preview(
                                        "Summarize",
                                        Map.of("TITLE", 80),
                                        List.of(Map.of("slide", 1)),
                                        "gpt-5.4",
                                        input)))
                .contains("Confidential revenue 42", "Board", "report.txt")
                .doesNotContain("unit-test-key", "request_sha256");
        var response = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(history).complete(eq(callId), response.capture(), eq(200), isNull());
        assertThat(response.getValue())
                .isEqualTo(
                        completed(
                                "{\"fields\":{\"TITLE\":\"Confidential revenue"
                                    + " 42\"},\"slides\":[]}"));
    }

    @Test
    void sourceProviderErrorIsPreservedInPrivateHistoryWithTheApiKeyMasked() {
        var input =
                GenerationInput.normalize(
                        null, null, new SourceMaterial("txt", "x.txt", "Private source"));
        server.expect(requestTo(URL))
                .andRespond(
                        withStatus(HttpStatus.BAD_REQUEST)
                                .body("Private source echoed unit-test-key"));
        assertThatThrownBy(
                        () ->
                                generator.generate(
                                        context, "Topic", Map.of(), List.of(), "gpt-5.4", input))
                .hasMessage("generation_failed");
        verify(history)
                .complete(
                        eq(callId),
                        eq("Private source echoed [REDACTED]"),
                        eq(400),
                        eq("generation_failed"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"incomplete", "in_progress", "failed"})
    void neverTreatsAnUnfinishedProviderResponseAsASuccess(String status) {
        server.expect(requestTo(URL))
                .andRespond(
                        withSuccess("{\"status\":\"" + status + "\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(this::generate)
                .isInstanceOf(AiGenerationException.class)
                .hasMessage("generation_incomplete");
        verify(history)
                .complete(callId, "{\"status\":\"" + status + "\"}", 200, "generation_incomplete");
    }

    @Test
    void completedResponseWithoutTextIsRejected() {
        server.expect(requestTo(URL))
                .andRespond(
                        withSuccess(
                                "{\"status\":\"completed\",\"output\":[]}",
                                MediaType.APPLICATION_JSON));
        assertThatThrownBy(this::generate).hasMessage("generation_empty");
    }

    @Test
    void invalidPlanDoesNotEscapeAsProviderContent() {
        server.expect(requestTo(URL))
                .andRespond(
                        withSuccess(
                                completed("{\"fields\":{},\"slides\":[],\"extra\":\"private\"}"),
                                MediaType.APPLICATION_JSON));
        assertThatThrownBy(this::generate).hasMessage("generation_failed");
    }

    @Test
    void providerHttpErrorsAreReportedWithoutResponseBodyOrApiKey() {
        server.expect(requestTo(URL))
                .andRespond(
                        withStatus(HttpStatus.UNAUTHORIZED)
                                .body("private provider diagnostic")
                                .contentType(MediaType.TEXT_PLAIN));
        assertThatThrownBy(this::generate).hasMessage("generation_failed");
    }

    @Test
    void missingCredentialsAndDisabledModeNeverIssueAnHttpRequest() {
        var missing =
                new PresentationContentGenerator(
                        client,
                        json,
                        new PresentationRequestFactory(),
                        new OpenAiResponseReader(json, new PresentationContentCodec(json)),
                        history,
                        "",
                        true);
        var disabled =
                new PresentationContentGenerator(
                        client,
                        json,
                        new PresentationRequestFactory(),
                        new OpenAiResponseReader(json, new PresentationContentCodec(json)),
                        history,
                        "unit-test-key",
                        false);
        for (var provider : List.of(missing, disabled)) {
            assertThat(provider.enabled()).isFalse();
            assertThatThrownBy(
                            () ->
                                    provider.generate(
                                            context, "Topic", Map.of(), List.of(), "gpt-5.4"))
                    .hasMessage("openai_disabled");
        }
        verifyNoInteractions(history);
    }

    @Test
    void previewWorksOfflineAndTreatsFormattingCharactersAsUserData() {
        String topic = "100%: %s — пользовательский текст";
        var preview =
                generator.preview(
                        topic, Map.of("TITLE", 80), List.of(Map.of("slide", 1)), "gpt-5.4");
        assertThat((String) preview.get("input")).contains(topic);
        assertThat(json.writeValueAsString(preview))
                .doesNotContain("unit-test-key", "Authorization");
        verifyNoInteractions(history);
    }

    @Test
    void recordsTheExactRequestAndRawResponseBeforeDecoding() {
        String response = completed("{\"fields\":{},\"slides\":[]}");
        server.expect(requestTo(URL))
                .andExpect(
                        request -> {
                            var body =
                                    ((org.springframework.mock.http.client.MockClientHttpRequest)
                                                    request)
                                            .getBodyAsString();
                            verify(history).start(context, "gpt-5.4", body);
                        })
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        generate();
        verify(history).complete(callId, response, 200, null);
    }

    @Test
    void recordsHttpErrorBodyAndRedactsTheConfiguredCredential() {
        server.expect(requestTo(URL))
                .andRespond(
                        withStatus(HttpStatus.TOO_MANY_REQUESTS)
                                .body("rate limited unit-test-key")
                                .contentType(MediaType.TEXT_PLAIN));
        assertThatThrownBy(this::generate).hasMessage("generation_failed");
        verify(history).complete(callId, "rate limited [REDACTED]", 429, "generation_failed");
    }

    @Test
    void keepsMalformedResponsesForDebugging() {
        server.expect(requestTo(URL)).andRespond(withSuccess("not json", MediaType.TEXT_PLAIN));
        assertThatThrownBy(this::generate).hasMessage("generation_failed");
        verify(history).complete(callId, "not json", 200, "generation_failed");
    }

    @Test
    void recordsNetworkFailuresWithoutInventingAResponse() {
        server.expect(requestTo(URL))
                .andRespond(withException(new java.io.IOException("connection reset")));
        assertThatThrownBy(this::generate)
                .hasMessage("generation_failed")
                .hasCauseInstanceOf(org.springframework.web.client.ResourceAccessException.class);
        verify(history).complete(callId, null, null, "generation_failed");
    }

    @Test
    void diagnosticsFailureDoesNotDiscardTheSuccessfulProviderResult() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(history)
                .complete(any(), any(), any(), any());
        server.expect(requestTo(URL))
                .andRespond(
                        withSuccess(
                                completed(
                                        "{\"fields\":{\"TITLE\":\"Сохранённый"
                                                + " ответ\"},\"slides\":[]}"),
                                MediaType.APPLICATION_JSON));
        assertThat(generate().fields()).containsEntry("TITLE", "Сохранённый ответ");
    }

    @Test
    void diagnosticsFailureDoesNotReplaceTheProviderError() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(history)
                .complete(any(), any(), any(), any());
        server.expect(requestTo(URL))
                .andRespond(withSuccess("{\"status\":\"incomplete\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(this::generate).hasMessage("generation_incomplete");
    }

    @Test
    void unavailableHistoryPreventsAnUntrackedPaidCall() {
        when(history.start(any(), anyString(), anyString()))
                .thenThrow(new IllegalStateException("database unavailable"));
        assertThatThrownBy(this::generate).hasMessage("database unavailable");
        verify(history, never()).complete(any(), any(), any(), any());
    }

    @Test
    void combinesAllOutputTextPartsBeforeReadingThePlan() {
        String response =
                json.writeValueAsString(
                        Map.of(
                                "status",
                                "completed",
                                "output",
                                List.of(
                                        Map.of("type", "reasoning"),
                                        Map.of(
                                                "content",
                                                List.of(
                                                        Map.of(
                                                                "type",
                                                                "output_text",
                                                                "text",
                                                                "{\"fields\":{\"TITLE\":\"Составной"
                                                                        + " ответ\"},"))),
                                        Map.of(
                                                "content",
                                                List.of(
                                                        Map.of(
                                                                "type",
                                                                "output_text",
                                                                "text",
                                                                "\"slides\":[]}"))))));
        server.expect(requestTo(URL)).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThat(generate().fields()).containsEntry("TITLE", "Составной ответ");
        verify(history).complete(callId, response, 200, null);
    }

    private ru.godeck.presentation.model.PresentationContent generate() {
        return generator.generate(
                context, "Topic", Map.of("TITLE", 80), List.of(Map.of("slide", 1)), "gpt-5.4");
    }

    private String completed(String plan) {
        return json.writeValueAsString(
                Map.of(
                        "status",
                        "completed",
                        "output",
                        List.of(
                                Map.of("type", "reasoning"),
                                Map.of(
                                        "content",
                                        List.of(Map.of("type", "output_text", "text", plan))))));
    }
}
