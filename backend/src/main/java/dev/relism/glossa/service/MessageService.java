package dev.relism.glossa.service;

import com.ibm.icu.util.ULocale;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.http.HttpException;
import dev.relism.glossa.content.FieldType.Variable;
import dev.relism.glossa.content.FieldTypes;
import dev.relism.glossa.content.MessageType;
import dev.relism.glossa.schema.Localization.MessageRequest;
import dev.relism.glossa.schema.Localization.Suggest;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Messages checked, previewed and translated without anything being stored (§6, §9) — the editor's
 * side of the field type, for values that are not a resource yet.
 */
public final class MessageService extends ProjectScoped {

    private static final String TRANSLATION_PROMPT = readPrompt();

    private final AiService ai;
    private final GlossaryService glossary;

    public MessageService(Data data, AiService ai, GlossaryService glossary) {
        super(data);
        this.ai = ai;
        this.glossary = glossary;
    }

    public MessageType.Analysis analyze(long project, String locale, MessageRequest request) {
        return inProject(project, false, () -> FieldTypes.MESSAGE
                .analyze(request.payload(), contractOf(request), enabled(project, locale).getLocale(), request.complete()));
    }

    public String preview(long project, String locale, MessageRequest request) {
        return inProject(project, false, () -> FieldTypes.MESSAGE
                .render(request.payload(), contractOf(request), enabled(project, locale).getLocale(), request.values()));
    }

    /**
     * §9: a translation for one message, for whoever asked to accept, edit or discard. Nothing is
     * stored, so what they keep is written by {@code LocalizationService#edit} as their own revision.
     * The provider is called outside any transaction: it takes seconds, and a database connection is
     * not for waiting in.
     */
    public Map<String, Object> suggest(long project, String locale, Suggest request) {
        String from = inProject(project, false, () -> {
            enabled(project, locale);
            return source(project).getLocale();
        });
        if (from.equals(locale)) throw HttpException.badRequest("That is the source locale.");
        Map<String, Variable> contract = request.contract() != null ? request.contract() : FieldTypes.MESSAGE.contractOf(request.payload());
        FieldTypes.MESSAGE.validate(request.payload(), contract, from, false);
        String system = prompt(project, from, locale, request);
        String ask = "Translate the source message into " + localeName(locale) + ". Return the ICU message only.";
        // ponytail: one retry, handing back the parser's own complaint. A model that misses twice is the wrong model.
        String refused = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            String answer = ai.complete(system, refused == null ? ask
                    : ask + "\n\nYour previous answer was refused: " + refused + "\nAnswer with a corrected message only.");
            Map<String, Object> suggested = Map.of("pattern", answer);
            try {
                FieldTypes.MESSAGE.validate(suggested, contract, locale, false);
            } catch (HttpException invalid) {
                refused = invalid.getMessage();
                continue;
            }
            // The payload alone: which model answered is the administrator's business, not a translator's.
            return suggested;
        }
        throw new HttpException(502, "The AI did not produce a usable message: " + refused);
    }

    private Map<String, Variable> contractOf(MessageRequest request) {
        return request.contract() != null ? request.contract() : FieldTypes.MESSAGE.contractOf(request.payload());
    }

    private String prompt(long project, String from, String locale, Suggest request) {
        Map<String, String> values = Map.ofEntries(
                Map.entry("source_locale_code", from),
                Map.entry("source_locale_name", localeName(from)),
                Map.entry("target_locale_code", locale),
                Map.entry("target_locale_name", localeName(locale)),
                Map.entry("source_plural_categories", categories(from, false)),
                Map.entry("source_ordinal_categories", categories(from, true)),
                Map.entry("target_plural_categories", categories(locale, false)),
                Map.entry("target_ordinal_categories", categories(locale, true)),
                Map.entry("context", request.context() == null || request.context().isBlank() ? "None." : request.context().trim()),
                Map.entry("glossary", glossary.forPrompt(project, locale)),
                Map.entry("content", String.valueOf(request.payload().get("pattern"))));
        String filled = TRANSLATION_PROMPT;
        for (Map.Entry<String, String> value : values.entrySet()) {
            filled = filled.replace("{{" + value.getKey() + "}}", value.getValue());
        }
        return filled;
    }

    /** English, because the prompt is: the code alone can be ambiguous, and the name disambiguates it. */
    private static String localeName(String tag) {
        return ULocale.forLanguageTag(tag).getDisplayName(ULocale.ENGLISH);
    }

    private static String categories(String tag, boolean ordinal) {
        return String.join(", ", MessageType.forms(tag, ordinal).keySet());
    }

    private static String readPrompt() {
        try (InputStream file = MessageService.class.getResourceAsStream("/prompts/translate-message.md")) {
            if (file == null) throw HttpException.internal("Missing translation prompt.");
            return new String(file.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw HttpException.internal("Could not read translation prompt.");
        }
    }
}
