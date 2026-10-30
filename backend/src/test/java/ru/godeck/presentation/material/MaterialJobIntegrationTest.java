package ru.godeck.presentation.material;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=false",
            "godeck.generation.poll-ms=86400000",
            "spring.datasource.hikari.schema=material_test",
            "spring.flyway.default-schema=material_test",
            "spring.flyway.schemas=material_test"
        })
@AutoConfigureMockMvc
class MaterialJobIntegrationTest {
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID OTHER = UUID.randomUUID();
    private static final String API = "/api/generation/v1/materials";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired MaterialJobService service;
    @Autowired ObjectMapper json;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        String url =
                System.getenv()
                        .getOrDefault(
                                "TEST_DATABASE_URL",
                                "jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test");
        properties.add(
                "spring.datasource.url",
                () -> url.replace("currentSchema=auth_test", "currentSchema=material_test"));
    }

    @BeforeEach
    void clean() {
        db.update("DELETE FROM material_jobs");
        for (UUID id : List.of(OWNER, OTHER))
            db.update(
                    "INSERT INTO app_users(id,email,password_hash,consent_at,created_at)"
                            + " VALUES(?,?,'test-only',now(),now()) ON CONFLICT(id) DO NOTHING",
                    id,
                    id + "@example.test");
    }

    @Test
    void acceptsDurablePrivateJobThenReturnsOwnedResult() throws Exception {
        var response =
                mvc.perform(multipart(API + "/extract").file(file()).with(as(OWNER)).with(csrf()))
                        .andExpect(status().isAccepted())
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andExpect(jsonPath("$.status").value("queued"))
                        .andExpect(jsonPath("$.result").isEmpty())
                        .andReturn();
        UUID id =
                UUID.fromString(
                        json.readTree(response.getResponse().getContentAsString())
                                .path("id")
                                .asText());
        assertThat(
                        db.queryForObject(
                                "SELECT payload FROM material_jobs WHERE id=?", byte[].class, id))
                .isEqualTo("Revenue: 73".getBytes(StandardCharsets.UTF_8));
        mvc.perform(get(API + "/{id}", id).with(as(OTHER))).andExpect(status().isNotFound());
        db.update(
                "UPDATE material_jobs SET status='succeeded',payload=NULL,result_json=? WHERE id=?",
                "{\"format\":\"txt\",\"name\":\"report.txt\",\"text\":\"Revenue:"
                        + " 73\",\"characters\":11,\"pages\":null,\"warnings\":[]}",
                id);
        mvc.perform(get(API + "/{id}", id).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.result.text").value("Revenue: 73"));
        assertThat(
                        db.queryForObject(
                                "SELECT payload FROM material_jobs WHERE id=?", byte[].class, id))
                .isNull();
    }

    @Test
    void requiresSessionAndCsrfAndRejectsMalformedUploads() throws Exception {
        mvc.perform(get(API + "/{id}", UUID.randomUUID())).andExpect(status().isUnauthorized());
        mvc.perform(multipart(API + "/extract").file(file()).with(as(OWNER)))
                .andExpect(status().isForbidden());
        mvc.perform(
                        multipart(API + "/extract")
                                .file(file())
                                .file(file())
                                .with(as(OWNER))
                                .with(csrf()))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(
                        multipart(API + "/extract")
                                .file(
                                        new MockMultipartFile(
                                                "file",
                                                "wrong.pdf",
                                                "text/plain",
                                                new byte[] {1, 2, 3}))
                                .with(as(OWNER))
                                .with(csrf()))
                .andExpect(status().isUnsupportedMediaType());
        mvc.perform(
                        multipart(API + "/extract")
                                .file(
                                        new MockMultipartFile(
                                                "file",
                                                "large.txt",
                                                "text/plain",
                                                new byte[MaterialPolicy.MAX_FILE_BYTES + 1]))
                                .with(as(OWNER))
                                .with(csrf()))
                .andExpect(status().isPayloadTooLarge());
        assertThat(db.queryForObject("SELECT count(*) FROM material_jobs", Long.class)).isZero();
    }

    @Test
    void queueLimitAndExpiredClaimsReleaseRawBytesWithoutAcceptingLateCompletion()
            throws Exception {
        var first = service.submit(OWNER, file());
        service.submit(OWNER, file());
        assertThatThrownBy(() -> service.submit(OWNER, file()))
                .isInstanceOf(GenerationException.class)
                .extracting(error -> ((GenerationException) error).code())
                .isEqualTo("source_busy");
        UUID token = UUID.randomUUID();
        db.update(
                "UPDATE material_jobs SET status='running',claim_id=?,deadline=now()-interval '1"
                        + " second' WHERE id=?",
                token,
                first.id());
        assertThat(service.get(OWNER, first.id()).error().code()).isEqualTo("source_timeout");
        assertThat(
                        db.queryForObject(
                                "SELECT payload FROM material_jobs WHERE id=?",
                                byte[].class,
                                first.id()))
                .isNull();
        assertThat(
                        db.update(
                                "UPDATE material_jobs SET status='succeeded' WHERE id=? AND"
                                        + " claim_id=? AND status='running' AND deadline>now()",
                                first.id(),
                                token))
                .isZero();
        service.submit(OWNER, file());
        db.update("UPDATE material_jobs SET expires_at=now()-interval '1 second'");
        service.cleanup();
        assertThat(db.queryForObject("SELECT count(*) FROM material_jobs", Long.class)).isZero();
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile(
                "file",
                "report.txt",
                "application/octet-stream",
                "Revenue: 73".getBytes(StandardCharsets.UTF_8));
    }

    private static RequestPostProcessor as(UUID owner) {
        return authentication(
                new UsernamePasswordAuthenticationToken(
                        new AuthPrincipal(owner, owner + "@example.test", 0), null, List.of()));
    }
}
