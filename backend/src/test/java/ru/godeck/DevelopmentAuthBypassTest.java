package ru.godeck;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=true",
            "godeck.generation.enabled=false",
            "spring.datasource.url=${TEST_DATABASE_URL:jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test}",
            "spring.datasource.hikari.schema=auth_test",
            "spring.flyway.default-schema=auth_test",
            "spring.flyway.schemas=auth_test"
        })
@AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class DevelopmentAuthBypassTest {
    @Autowired MockMvc mvc;

    @Test
    void localBypassSuppliesStableDebugIdentityWithoutSession() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value("debug@godeck.local"));
        mvc.perform(get("/api/generation/v1/presentations")).andExpect(status().isOk());
        mvc.perform(get("/api/generation/v1/templates"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value("aurora"));
        mvc.perform(
                        post("/api/generation/v1/prompts/preview")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"aurora\",\"topic\":\"Тестовый проект"
                                            + " для просмотра запроса\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.model").exists())
                .andExpect(jsonPath("$.instructions").exists())
                .andExpect(
                        jsonPath("$.input")
                                .value(org.hamcrest.Matchers.containsString("Тестовый проект")));
        mvc.perform(
                        post("/api/generation/v1/presentations")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"aurora\",\"topic\":\"Ручное заполнение"
                                            + " тестовой презентации\",\"mode\":\"manual\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.mode").value("manual"))
                .andExpect(jsonPath("$.status").value("awaiting_content"));
        mvc.perform(
                        post("/api/generation/v1/presentations")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"aurora\",\"topic\":\"Тестовая"
                                            + " презентация\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("openai_disabled"));
    }
}
