package ru.godeck.presentation.material;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import ru.godeck.presentation.controller.UploadLimitExceptionHandler;

import java.util.Map;

class UploadLimitExceptionHandlerTest {
    @Test
    void reportsDocumentLimitBeforeControllerResolutionAndKeepsImageErrorCompatible() {
        var handler = new UploadLimitExceptionHandler();
        for (var endpoint :
                Map.of(
                                "/api/generation/v1/materials/extract", "source_limit",
                                "/api/generation/v1/presentations/id/editor/assets", "image_limit")
                        .entrySet()) {
            var response =
                    handler.tooLarge(
                            new MaxUploadSizeExceededException(1),
                            new MockHttpServletRequest("POST", endpoint.getKey()));
            assertThat(response.getStatusCode().value()).isEqualTo(413);
            assertThat(((Map<?, ?>) response.getBody().get("error")).get("code"))
                    .isEqualTo(endpoint.getValue());
            assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        }
    }
}
