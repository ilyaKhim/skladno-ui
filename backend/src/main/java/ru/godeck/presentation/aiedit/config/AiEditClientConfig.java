package ru.godeck.presentation.aiedit.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * HTTP client of AI text edits: a 30-second read timeout instead of the generation client's two
 * minutes. It is not a default candidate, so existing {@code RestClient} injection points keep
 * receiving {@code openAiClient}; text-edit code asks for it by name.
 */
@Configuration
public class AiEditClientConfig {
    public static final String CLIENT = "openAiTextEditClient";

    @Bean(name = CLIENT, defaultCandidate = false)
    RestClient openAiTextEditClient(AiEditSettings settings) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(settings.connectTimeout());
        factory.setReadTimeout(settings.readTimeout());
        return RestClient.builder().requestFactory(factory).build();
    }
}
