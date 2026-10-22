package ru.godeck.presentation.repository;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

class OffsetPageRequestTest {
    @Test
    void arbitraryOffsetIsPreservedAcrossNavigation() {
        var window = new OffsetPageRequest(3, 2);
        assertThat(window.getOffset()).isEqualTo(3);
        assertThat(window.next().getOffset()).isEqualTo(5);
        assertThat(window.previousOrFirst().getOffset()).isEqualTo(1);
        assertThat(window.first().getOffset()).isZero();
        assertThat(window.withPage(4).getOffset()).isEqualTo(8);
        assertThat(window.getSort())
                .isEqualTo(Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
    }

    @Test
    void invalidOffsetsSizesAndPagesFailImmediately() {
        assertThatThrownBy(() -> new OffsetPageRequest(-1, 2))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OffsetPageRequest(0, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OffsetPageRequest(0, -1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OffsetPageRequest(0, 2).withPage(-1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void navigationDoesNotSilentlyOverflow() {
        assertThatThrownBy(() -> new OffsetPageRequest(Integer.MAX_VALUE, 2).next())
                .isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> new OffsetPageRequest(0, 2).withPage(Integer.MAX_VALUE))
                .isInstanceOf(ArithmeticException.class);
    }
}
