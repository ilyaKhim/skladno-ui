package ru.godeck.common.text;

import java.text.MessageFormat;
import java.util.Locale;
import java.util.ResourceBundle;

public final class BackendMessages {
    private static final Locale LANGUAGE = Locale.forLanguageTag("ru");
    private static final ResourceBundle MESSAGES =
            ResourceBundle.getBundle("messages", Locale.ROOT);

    private BackendMessages() {}

    public static String text(String key, Object... arguments) {
        String pattern = MESSAGES.getString(key);
        return arguments.length == 0
                ? pattern
                : new MessageFormat(pattern, LANGUAGE).format(arguments);
    }
}
