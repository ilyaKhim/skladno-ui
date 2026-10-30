package ru.godeck.presentation.material;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import ru.godeck.presentation.dto.ExtractedMaterial;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.GenerationInput;

import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;

/** Owns upload authorization and the durable queue; document parsing belongs to the worker. */
@Service
public class MaterialJobService {
    private final JdbcClient db;
    private final ObjectMapper json;

    public MaterialJobService(JdbcClient db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    /**
     * Bounded inputs are committed before 202, so closing the browser cannot lose accepted work.
     */
    @Transactional
    public Job submit(UUID owner, MultipartFile file) {
        if (file.isEmpty()) throw new GenerationException(GenerationError.SOURCE_EMPTY);
        if (file.getSize() > MaterialPolicy.MAX_FILE_BYTES)
            throw new GenerationException(GenerationError.SOURCE_LIMIT);
        String name = GenerationInput.safeName(file.getOriginalFilename());
        String format = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!java.util.Set.of("pdf", "docx", "txt").contains(format))
            throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
        byte[] bytes;
        try (var input = file.getInputStream()) {
            bytes = input.readNBytes(MaterialPolicy.MAX_FILE_BYTES + 1);
        } catch (IOException failure) {
            throw new GenerationException(GenerationError.SOURCE_INVALID);
        }
        if (bytes.length > MaterialPolicy.MAX_FILE_BYTES)
            throw new GenerationException(GenerationError.SOURCE_LIMIT);
        validateSignature(bytes, format);
        // A short admission lock makes global/per-user limits exact across concurrent API
        // instances.
        db.sql("SELECT pg_advisory_xact_lock(71983402)").query(Object.class).single();
        cleanup();
        long global =
                db.sql("SELECT count(*) FROM material_jobs WHERE status IN ('queued','running')")
                        .query(Long.class)
                        .single();
        long own =
                db.sql(
                                "SELECT count(*) FROM material_jobs WHERE user_id=:owner AND status"
                                        + " IN ('queued','running')")
                        .param("owner", owner)
                        .query(Long.class)
                        .single();
        if (global >= 20 || own >= 2) throw new GenerationException(GenerationError.SOURCE_BUSY);
        UUID id = UUID.randomUUID();
        db.sql(
                        "INSERT INTO material_jobs(id,user_id,name,format,status,payload,deadline)"
                            + " VALUES(:id,:owner,:name,:format,'queued',:payload,now()+interval"
                            + " '60 seconds')")
                .param("id", id)
                .param("owner", owner)
                .param("name", name)
                .param("format", format)
                .param("payload", bytes)
                .update();
        return new Job(id, "queued", null, null);
    }

    /** Every poll is owner-scoped; failed parsing is a job result, not a failed HTTP read. */
    @Transactional
    public Job get(UUID owner, UUID id) {
        cleanup();
        return db.sql(
                        "SELECT id,status,result_json,error_code FROM material_jobs WHERE id=:id"
                                + " AND user_id=:owner AND expires_at>now()")
                .param("id", id)
                .param("owner", owner)
                .query(
                        (row, number) -> {
                            var result = row.getString("result_json");
                            String code = row.getString("error_code");
                            var error =
                                    code == null
                                            ? null
                                            : Arrays.stream(GenerationError.values())
                                                    .filter(
                                                            candidate ->
                                                                    candidate.code().equals(code))
                                                    .findFirst()
                                                    .orElse(GenerationError.SOURCE_INVALID);
                            return new Job(
                                    id,
                                    row.getString("status"),
                                    result == null
                                            ? null
                                            : json.readValue(result, ExtractedMaterial.class),
                                    error == null
                                            ? null
                                            : new Failure(error.code(), error.message()));
                        })
                .optional()
                .orElseThrow(() -> new GenerationException(GenerationError.SOURCE_NOT_FOUND));
    }

    /**
     * Clear raw input on any terminal outcome; also bound abandoned queued jobs and result
     * lifetime.
     */
    @Scheduled(fixedDelay = 60000)
    public void cleanup() {
        db.sql(
                        "UPDATE material_jobs SET"
                            + " status='failed',error_code='source_timeout',payload=NULL,claim_id=NULL"
                            + " WHERE status IN ('queued','running') AND deadline<now()")
                .update();
        db.sql("DELETE FROM material_jobs WHERE expires_at<now()").update();
    }

    private static void validateSignature(byte[] bytes, String format) {
        boolean pdf =
                bytes.length >= 5
                        && new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII)
                                .equals("%PDF-");
        boolean zip =
                bytes.length >= 4
                        && bytes[0] == 'P'
                        && bytes[1] == 'K'
                        && bytes[2] == 3
                        && bytes[3] == 4;
        boolean ole =
                bytes.length >= 4
                        && bytes[0] == (byte) 0xD0
                        && bytes[1] == (byte) 0xCF
                        && bytes[2] == 0x11
                        && bytes[3] == (byte) 0xE0;
        if (format.equals("pdf") && !pdf
                || format.equals("docx") && !zip && !ole
                || format.equals("txt") && (pdf || zip || ole))
            throw new GenerationException(GenerationError.UNSUPPORTED_SOURCE);
    }

    public record Job(UUID id, String status, ExtractedMaterial result, Failure error) {}

    public record Failure(String code, String message) {}
}
