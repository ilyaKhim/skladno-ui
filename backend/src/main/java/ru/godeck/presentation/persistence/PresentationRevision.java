package ru.godeck.presentation.persistence;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "presentation_revisions")
public class PresentationRevision {
    @Id private UUID id;

    @Column(name = "presentation_id", nullable = false)
    private UUID presentationId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private int version;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    @Column(nullable = false, columnDefinition = "text")
    private String reply;

    @Column(name = "content_json", nullable = false, columnDefinition = "text")
    private String contentJson;

    @Column(name = "output_path", nullable = false, columnDefinition = "text")
    private String outputPath;

    @Column(name = "slide_count", nullable = false)
    private int slideCount;

    @Column(length = 100)
    private String model;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PresentationRevision() {}

    public PresentationRevision(
            UUID presentationId,
            UUID userId,
            int version,
            String message,
            String reply,
            String contentJson,
            String outputPath,
            int slideCount,
            String model,
            Instant createdAt) {
        id = UUID.randomUUID();
        this.presentationId = presentationId;
        this.userId = userId;
        this.version = version;
        this.message = message;
        this.reply = reply;
        this.contentJson = contentJson;
        this.outputPath = outputPath;
        this.slideCount = slideCount;
        this.model = model;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPresentationId() {
        return presentationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getVersion() {
        return version;
    }

    public String getMessage() {
        return message;
    }

    public String getReply() {
        return reply;
    }

    public String getContentJson() {
        return contentJson;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public int getSlideCount() {
        return slideCount;
    }

    public String getModel() {
        return model;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
