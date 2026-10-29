package ru.godeck;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
public class GoDeckApplication {

    public static void main(String[] args) throws Exception {
        if (args.length > 0
                && ru.godeck.presentation.material.MaterialExtractionProcess.ARGUMENT.equals(
                        args[0])) {
            ru.godeck.presentation.material.MaterialExtractionProcess.run(args);
            return;
        }
        SpringApplication.run(GoDeckApplication.class, args);
    }
}
