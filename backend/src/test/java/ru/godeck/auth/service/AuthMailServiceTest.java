package ru.godeck.auth.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class AuthMailServiceTest {
    @Test
    void verificationMailIncludesCodeAndExpiry() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new AuthMailService(sender, "GoDeck <from@example.test>", "http://localhost:3001/")
                .sendCode("to@example.test", "012345");
        var capture = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(capture.capture());
        var message = capture.getValue();
        assertThat(message.getTo()).containsExactly("to@example.test");
        assertThat(message.getSubject()).isEqualTo("GoDeck: подтверждение почты");
        assertThat(message.getText()).contains("012345", "10 минут").doesNotContain("{0}", "{1}");
    }

    @Test
    void resetLinkUsesAFragmentAndNormalizesTrailingSlashes() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new AuthMailService(sender, "from@example.test", "http://localhost:3001////")
                .sendReset("to@example.test", "reset-token");
        var capture = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(capture.capture());
        assertThat(capture.getValue().getText())
                .contains("http://localhost:3001/auth/reset/#token=reset-token", "30 минут")
                .doesNotContain("?token=", "{0}", "{1}");
    }
}
