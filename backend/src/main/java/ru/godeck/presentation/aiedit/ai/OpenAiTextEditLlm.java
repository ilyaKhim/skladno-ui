package ru.godeck.presentation.aiedit.ai;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;

/** Production model: one strict-schema Responses API call per edit. */
@Component
@ConditionalOnProperty(name = "godeck.ai-edit.llm", havingValue = "openai", matchIfMissing = true)
public class OpenAiTextEditLlm implements TextEditLlm {
    private final AiResponsesClient client;
    private final TextEditRequestFactory requests;
    private final TextEditResponseParser responses;

    public OpenAiTextEditLlm(
            AiResponsesClient client,
            TextEditRequestFactory requests,
            TextEditResponseParser responses) {
        this.client = client;
        this.requests = requests;
        this.responses = responses;
    }

    @Override
    public boolean enabled() {
        return client.enabled();
    }

    @Override
    public TextEditOutcome edit(TextEditPrompt prompt) {
        return client.call(
                new AiCallContext(prompt.presentationId(), AiOperation.TEXT_EDIT),
                prompt.model(),
                requests.create(prompt),
                responses::parse);
    }
}
