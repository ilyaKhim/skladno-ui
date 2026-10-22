package ru.godeck.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import ru.godeck.auth.policy.AuthPolicy;
import ru.godeck.common.text.BackendMessages;

@Service
public class AuthMailService {
    private final JavaMailSender sender;
    private final String from;
    private final String frontendUrl;

    public AuthMailService(
            JavaMailSender sender,
            @Value("${godeck.mail-from}") String from,
            @Value("${godeck.frontend-url}") String frontendUrl) {
        this.sender = sender;
        this.from = from;
        this.frontendUrl = frontendUrl.replaceAll("/+$", "");
    }

    private static final String RESET_PATH = "/auth/reset/#token=";

    public void sendCode(String email, String code) {
        send(
                email,
                BackendMessages.text("auth.mail.verification.subject"),
                BackendMessages.text(
                        "auth.mail.verification.body", code, AuthPolicy.CODE_VALIDITY_MINUTES));
    }

    public void sendReset(String email, String token) {
        send(
                email,
                BackendMessages.text("auth.mail.reset.subject"),
                BackendMessages.text(
                        "auth.mail.reset.body",
                        frontendUrl + RESET_PATH + token,
                        AuthPolicy.RESET_VALIDITY_MINUTES));
    }

    private void send(String email, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(subject);
        message.setText(body);
        sender.send(message);
    }
}
