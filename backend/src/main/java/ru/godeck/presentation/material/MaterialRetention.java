package ru.godeck.presentation.material;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.repository.PresentationRepository;

import java.time.Clock;

/** Removes old input copies without changing generated slides, versions, or unfinished jobs. */
@Component
public class MaterialRetention {
    private final PresentationRepository presentations;
    private final Clock clock;

    public MaterialRetention(PresentationRepository presentations, Clock clock) {
        this.presentations = presentations;
        this.clock = clock;
    }

    /**
     * Removes expired terminal inputs only; later presentation edits do not extend their deadline.
     */
    @Scheduled(
            initialDelayString = "${godeck.materials.cleanup-ms:3600000}",
            fixedDelayString = "${godeck.materials.cleanup-ms:3600000}")
    @Transactional
    public int clearExpired() {
        return presentations.clearExpiredGenerationInputs(clock.instant());
    }
}
