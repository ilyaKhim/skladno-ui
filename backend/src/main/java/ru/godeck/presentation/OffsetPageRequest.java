package ru.godeck.presentation;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

// Preserves the existing API's arbitrary offset instead of rounding it to a page boundary.
record OffsetPageRequest(int offset, int size) implements Pageable {
    public int getPageNumber() {
        return offset / size;
    }

    public int getPageSize() {
        return size;
    }

    public long getOffset() {
        return offset;
    }

    public Sort getSort() {
        return Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
    }

    public Pageable next() {
        return new OffsetPageRequest(offset + size, size);
    }

    public Pageable previousOrFirst() {
        return new OffsetPageRequest(Math.max(0, offset - size), size);
    }

    public Pageable first() {
        return new OffsetPageRequest(0, size);
    }

    public Pageable withPage(int page) {
        return new OffsetPageRequest(Math.multiplyExact(page, size), size);
    }

    public boolean hasPrevious() {
        return offset > 0;
    }
}
