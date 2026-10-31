package ru.godeck.support;

import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/** Unit-test defaults without production-only test constructors or developer environment files. */
public final class TestSettings {
    private TestSettings() {}

    public static <T> T defaults(Class<T> type) {
        return new Binder(new MapConfigurationPropertySource()).bindOrCreate("settings", Bindable.of(type));
    }
}
