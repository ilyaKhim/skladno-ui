package ru.godeck;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class GoDeckApplication {

	public static void main(String[] args) {
		SpringApplication.run(GoDeckApplication.class, args);
	}

}
