package ru.godeck.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import ru.godeck.presentation.config.GenerationSettings;

@Configuration
public class OpenAiClientConfig {
    @Bean
    RestClient openAiClient(GenerationSettings settings) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(settings.connectTimeout());
        factory.setReadTimeout(settings.readTimeout());
        return RestClient.builder().requestFactory(factory).build();
    }
}
