package ru.godeck.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
class AuthMailService {
    private final JavaMailSender sender;
    private final String from;
    private final String frontendUrl;

    AuthMailService(
            JavaMailSender sender,
            @Value("${godeck.mail-from}") String from,
            @Value("${godeck.frontend-url}") String frontendUrl) {
        this.sender = sender;
        this.from = from;
        this.frontendUrl = frontendUrl.replaceAll("/+$", "");
    }

    void sendCode(String email, String code) {
        send(
                email,
                "GoDeck: подтверждение почты",
                "Код подтверждения: "
                        + code
                        + "\n\nКод действует 10 минут. Никому его не сообщайте."
                        + "\nЕсли вы не регистрировались в GoDeck, проигнорируйте письмо.");
    }

    void sendReset(String email, String token) {
        send(
                email,
                "GoDeck: восстановление пароля",
                "Задайте новый пароль по ссылке:\n"
                        + frontendUrl
                        + "/auth/reset/#token="
                        + token
                        + "\n\nСсылка действует 30 минут и может быть использована один раз."
                        + "\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо.");
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
