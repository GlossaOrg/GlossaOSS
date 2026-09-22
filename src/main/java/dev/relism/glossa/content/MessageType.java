package dev.relism.glossa.content;

import com.ibm.icu.text.DateFormat;
import com.ibm.icu.text.MessageFormat;
import com.ibm.icu.text.MessagePattern;
import com.ibm.icu.text.MessagePattern.ArgType;
import com.ibm.icu.text.MessagePattern.Part;
import com.ibm.icu.text.PluralRules;
import com.ibm.icu.util.Calendar;
import com.ibm.icu.util.LocaleData;
import com.ibm.icu.util.TimeZone;
import com.ibm.icu.util.ULocale;
import com.ibm.icu.util.VersionInfo;
import dev.relism.flash.exceptions.HttpException;

import java.text.Format;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** §6's message: a named-argument ICU MessageFormat pattern checked against a typed contract and CLDR's plural rules. */
public final class MessageType implements FieldType {

    public static final String PROFILE = "glossa-icu1-v1";
    public static final String ICU = VersionInfo.ICU_VERSION.toString();
    public static final String CLDR = LocaleData.getCLDRVersion().toString();

    public record Analysis(Map<String, Variable> contract, List<Node> structure, Map<String, Object> payload, boolean rtl) {}

    private static final Set<String> LANGUAGES =
            Arrays.stream(ULocale.getAvailableLocales()).map(ULocale::getLanguage).collect(Collectors.toUnmodifiableSet());

    @Override
    public String name() {
        return "message";
    }

    /** The canonical form of a BCP 47 tag, refused unless ICU has data for its language. */
    public static String locale(String tag) {
        try {
            ULocale parsed = ULocale.createCanonical(new ULocale.Builder().setLanguageTag(tag).build().toString());
            if (!parsed.getLanguage().isEmpty() && LANGUAGES.contains(parsed.getLanguage()) && tag.equals(tag.trim())) {
                return parsed.toLanguageTag();
            }
        } catch (RuntimeException invalid) {
            // Refused below, like an unknown language.
        }
        throw HttpException.badRequest("Unsupported locale: " + tag + ".");
    }

    @Override
    public void validate(Map<String, Object> payload, Map<String, Variable> contract, String locale, boolean complete) {
        analyze(payload, contract, locale, complete);
    }

    /**
     * Every argument the pattern uses, at any depth, typed by how it is used. Discovery walks the whole
     * AST before anything is judged, so where a name first appears — top level or six branches down —
     * changes nothing.
     */
    @Override
    public Map<String, Variable> contractOf(Map<String, Object> payload) {
        MessagePattern ast = parse(pattern(payload));
        Map<String, Variable> contract = new TreeMap<>();
        for (int i = 0; i < ast.countParts(); i++) {
            if (ast.getPart(i).getType() == Part.Type.ARG_START) declare(contract, ast.getSubstring(ast.getPart(i + 1)), use(ast, i));
        }
        return contract;
    }

    /** The type one use pins: a plural counts, a date is temporal, a select enumerates, a bare hole says nothing. */
    private static Variable use(MessagePattern ast, int start) {
        String name = ast.getSubstring(ast.getPart(start + 1));
        return switch (ast.getPart(start).getArgType()) {
            case NONE -> new Variable(VariableType.TEXT, List.of());
            case SIMPLE -> switch (ast.getSubstring(ast.getPart(start + 2))) {
                case "number" -> new Variable(VariableType.NUMBER, List.of());
                case "date", "time" -> new Variable(VariableType.TEMPORAL, List.of());
                default -> throw HttpException.badRequest("Unsupported formatter for " + name + ".");
            };
            case PLURAL, SELECTORDINAL -> new Variable(VariableType.NUMBER, List.of());
            case SELECT -> selected(ast, start);
            case CHOICE -> throw HttpException.badRequest("Use plural or select instead of choice.");
        };
    }

    /** A select's branches are the values its variable may take; true and false alone make it a boolean. */
    private static Variable selected(MessagePattern ast, int start) {
        List<String> values = new ArrayList<>();
        int limit = ast.getLimitPartIndex(start);
        for (int j = start + 2; j < limit; j++) {
            Part part = ast.getPart(j);
            if (part.getType() == Part.Type.MSG_START) j = ast.getLimitPartIndex(j);
            else if (part.getType() == Part.Type.ARG_SELECTOR) {
                String branch = ast.getSubstring(part);
                if (!branch.equals("other") && !values.contains(branch)) values.add(branch);
            }
        }
        return !values.isEmpty() && Set.of("true", "false").containsAll(values)
                ? new Variable(VariableType.BOOLEAN, List.of())
                : new Variable(VariableType.SELECT, values);
    }

    /** A name used twice: a bare hole yields, two selects merge their branches, and the rest must agree. */
    private static void declare(Map<String, Variable> contract, String name, Variable use) {
        Variable known = contract.putIfAbsent(name, use);
        if (known == null || known.equals(use) || use.type() == VariableType.TEXT) return;
        if (known.type() == VariableType.TEXT) {
            contract.put(name, use);
        } else if (known.type() == VariableType.SELECT && use.type() == VariableType.SELECT) {
            contract.put(name, new Variable(VariableType.SELECT,
                    Stream.concat(known.values().stream(), use.values().stream()).distinct().toList()));
        } else {
            throw HttpException.badRequest(name + " is used as " + known.type().name().toLowerCase()
                    + " and as " + use.type().name().toLowerCase() + ".");
        }
    }

    public Analysis analyze(Map<String, Object> payload, Map<String, Variable> given, String tag, boolean complete) {
        String locale = locale(tag);
        String text = pattern(payload);
        Map<String, Variable> contract = given == null ? Map.of() : given;
        checkContract(contract);
        MessagePattern ast = parse(text);
        Set<String> used = new HashSet<>();
        for (int i = 0; i < ast.countParts(); i++) {
            Part part = ast.getPart(i);
            if (part.getType() == Part.Type.MSG_START && part.getValue() > 16) {
                throw HttpException.badRequest("Nest messages at most 16 levels deep.");
            }
            if (part.getType() != Part.Type.ARG_START) continue;
            String name = ast.getSubstring(ast.getPart(i + 1));
            Variable variable = contract.get(name);
            if (variable == null) throw HttpException.badRequest("Declare the variable " + name + ".");
            used.add(name);
            switch (part.getArgType()) {
                case NONE -> { }
                case SIMPLE -> expect(name, variable, switch (ast.getSubstring(ast.getPart(i + 2))) {
                    case "number" -> VariableType.NUMBER;
                    case "date", "time" -> VariableType.TEMPORAL;
                    default -> throw HttpException.badRequest("Unsupported formatter for " + name + ".");
                });
                case CHOICE -> throw HttpException.badRequest("Use plural or select instead of choice.");
                case SELECT, PLURAL, SELECTORDINAL -> checkBranches(ast, i, name, variable, locale, complete);
            }
        }
        if (!used.equals(contract.keySet())) throw HttpException.badRequest("Remove the variables the message doesn't use.");
        try {
            formatter(text, locale);
        } catch (RuntimeException invalid) {
            throw HttpException.badRequest("Invalid ICU formatter: " + invalid.getMessage());
        }
        return new Analysis(new TreeMap<>(contract), nodes(ast, 0, locale), payload, ULocale.forLanguageTag(locale).isRightToLeft());
    }

    @Override
    public String render(Map<String, Object> payload, Map<String, Variable> contract, String locale, Map<String, Object> values) {
        Analysis analysis = analyze(payload, contract, locale, false);
        if (values == null || !values.keySet().equals(analysis.contract().keySet())) {
            throw HttpException.badRequest("Pass exactly the variables the message declares.");
        }
        Map<String, Object> arguments = new HashMap<>();
        analysis.contract().forEach((name, variable) -> arguments.put(name, argument(name, variable, values.get(name), locale)));
        try {
            return formatter(pattern(payload), locale(locale)).format(arguments);
        } catch (RuntimeException invalid) {
            throw HttpException.badRequest("ICU rendering failed: " + invalid.getMessage());
        }
    }

    private static String pattern(Map<String, Object> payload) {
        if (payload == null || payload.size() != 1 || !(payload.get("pattern") instanceof String text) || text.length() > 32_768) {
            throw HttpException.badRequest("A message payload is only a pattern of at most 32768 characters.");
        }
        return text;
    }

    private static void checkContract(Map<String, Variable> contract) {
        if (contract.size() > 64) throw HttpException.badRequest("Declare at most 64 variables.");
        contract.forEach((name, variable) -> {
            if (name == null || !name.matches("[A-Za-z_][A-Za-z0-9_]*") || variable == null || variable.type() == null) {
                throw HttpException.badRequest("Invalid variable contract.");
            }
            List<String> values = variable.values();
            if (variable.type() != VariableType.SELECT) {
                if (!values.isEmpty()) throw HttpException.badRequest("Only a SELECT variable declares values.");
            } else if (values.isEmpty() || values.size() > 64 || Set.copyOf(values).size() != values.size()
                    || values.stream().anyMatch(value -> !value.matches("[A-Za-z_][A-Za-z0-9_-]*") || value.equals("other"))) {
                throw HttpException.badRequest("A SELECT variable declares up to 64 unique names, other excluded.");
            }
        });
    }

    private static MessagePattern parse(String text) {
        MessagePattern ast;
        try {
            ast = new MessagePattern(MessagePattern.ApostropheMode.DOUBLE_OPTIONAL).parse(text);
        } catch (RuntimeException invalid) {
            throw HttpException.badRequest("Invalid ICU pattern: " + invalid.getMessage());
        }
        if (ast.hasNumberedArguments()) throw HttpException.badRequest("Use named arguments.");
        if (ast.countParts() > 2048) throw HttpException.badRequest("The message is too complex.");
        return ast;
    }

    /** Checks the branches of the plural, selectordinal or select argument starting at part {@code start}. */
    private static void checkBranches(MessagePattern ast, int start, String name, Variable variable, String locale, boolean complete) {
        ArgType kind = ast.getPart(start).getArgType();
        boolean select = kind == ArgType.SELECT;
        if (select && variable.type() != VariableType.SELECT && variable.type() != VariableType.BOOLEAN) {
            throw HttpException.badRequest("Declare " + name + " as SELECT or BOOLEAN.");
        }
        if (!select) expect(name, variable, VariableType.NUMBER);
        double offset = select ? 0 : ast.getPluralOffset(start + 2);
        PluralRules rules = select ? null : PluralRules.forLocale(ULocale.forLanguageTag(locale),
                kind == ArgType.PLURAL ? PluralRules.PluralType.CARDINAL : PluralRules.PluralType.ORDINAL);
        Set<String> allowed = !select ? rules.getKeywords()
                : Set.copyOf(variable.type() == VariableType.BOOLEAN ? List.of("true", "false") : variable.values());
        Set<String> branches = new HashSet<>();
        Set<Double> exact = new HashSet<>();
        int limit = ast.getLimitPartIndex(start);
        for (int j = start + 2; j < limit; j++) {
            Part part = ast.getPart(j);
            if (part.getType() == Part.Type.MSG_START) {
                j = ast.getLimitPartIndex(j);
                continue;
            }
            if (part.getType() != Part.Type.ARG_SELECTOR) continue;
            String branch = ast.getSubstring(part);
            if (!branches.add(branch)) throw HttpException.badRequest("Duplicate branch " + branch + " in " + name + ".");
            if (branch.startsWith("=")) {
                double number = ast.getNumericValue(ast.getPart(j + 1));
                if (!Double.isFinite(number) || !exact.add(number)) {
                    throw HttpException.badRequest("Duplicate or invalid exact match in " + name + ".");
                }
            } else if (!branch.equals("other") && !allowed.contains(branch)) {
                throw HttpException.badRequest("Unknown branch " + branch + " in " + name + " for " + locale + ".");
            }
        }
        if (!branches.contains("other")) throw HttpException.badRequest("Add an other branch to " + name + ".");
        if (complete && !select) {
            for (String category : allowed) {
                if (!branches.contains(category) && !coveredByExactMatches(rules, category, offset, exact)) {
                    throw HttpException.badRequest("Add the " + category + " branch to " + name + " for " + locale + ".");
                }
            }
        }
    }

    @Override
    public List<Node> structureOf(Map<String, Object> payload, String tag) {
        return nodes(parse(pattern(payload)), 0, locale(tag));
    }

    @Override
    public Map<String, Object> payloadOf(List<Node> nodes) {
        StringBuilder pattern = new StringBuilder();
        write(pattern, nodes == null ? List.of() : nodes);
        return Map.of("pattern", pattern.toString());
    }

    /**
     * The message starting at part {@code msg}, as literal text and the arguments between it. Quoting
     * is undone here and put back by {@link #write}, so nothing downstream ever sees ICU escaping.
     */
    private static List<Node> nodes(MessagePattern ast, int msg, String locale) {
        String pattern = ast.getPatternString();
        List<Node> out = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        int limit = ast.getLimitPartIndex(msg);
        int from = ast.getPart(msg).getLimit();
        for (int i = msg + 1; i < limit; i++) {
            Part part = ast.getPart(i);
            switch (part.getType()) {
                // SKIP_SYNTAX drops the quote marks and the first of a doubled apostrophe; whatever
                // survives in the source is already the literal text, so INSERT_CHAR is not replayed.
                case SKIP_SYNTAX -> {
                    text.append(pattern, from, part.getIndex());
                    from = part.getLimit();
                }
                case ARG_START -> {
                    text.append(pattern, from, part.getIndex());
                    if (!text.isEmpty()) out.add(new Node.Text(text.toString()));
                    text.setLength(0);
                    out.add(argument(ast, i, locale));
                    i = ast.getLimitPartIndex(i);
                    from = ast.getPart(i).getLimit();
                }
                default -> { }
            }
        }
        text.append(pattern, from, ast.getPart(limit).getIndex());
        if (!text.isEmpty()) out.add(new Node.Text(text.toString()));
        return out;
    }

    private static Node argument(MessagePattern ast, int start, String locale) {
        String name = ast.getSubstring(ast.getPart(start + 1));
        ArgType kind = ast.getPart(start).getArgType();
        return switch (kind) {
            case NONE -> new Node.Hole(name, null, null);
            // ICU keeps the space before a style in the substring; composing would add another every round.
            case SIMPLE -> new Node.Hole(name, ast.getSubstring(ast.getPart(start + 2)).strip(),
                    ast.getPart(start + 3).getType() == Part.Type.ARG_STYLE ? ast.getSubstring(ast.getPart(start + 3)).strip() : null);
            case PLURAL, SELECTORDINAL, SELECT -> choice(ast, start, name, kind, locale);
            case CHOICE -> throw HttpException.badRequest("Use plural or select instead of choice.");
        };
    }

    private static Node.Choice choice(MessagePattern ast, int start, String name, ArgType kind, String locale) {
        double offset = kind == ArgType.SELECT ? 0 : ast.getPluralOffset(start + 2);
        List<Node.Branch> branches = new ArrayList<>();
        int limit = ast.getLimitPartIndex(start);
        for (int i = start + 2; i < limit; i++) {
            if (ast.getPart(i).getType() != Part.Type.ARG_SELECTOR) continue;
            int body = i + 1;
            while (ast.getPart(body).getType() != Part.Type.MSG_START) body++;
            branches.add(new Node.Branch(ast.getSubstring(ast.getPart(i)), nodes(ast, body, locale)));
            i = ast.getLimitPartIndex(body);
        }
        return new Node.Choice(name, kind.name(), offset, branches);
    }

    /** §6: the categories CLDR asks of a locale, each with a few of its own sample numbers. */
    public static Map<String, List<String>> forms(String tag, boolean ordinal) {
        PluralRules rules = PluralRules.forLocale(ULocale.forLanguageTag(locale(tag)),
                ordinal ? PluralRules.PluralType.ORDINAL : PluralRules.PluralType.CARDINAL);
        return samples(rules, rules.getKeywords());
    }

    /** What an apostrophe would quote if it were left alone. */
    private static final String QUOTES = "{}#|'";

    private static char next(String value, int at) {
        return at + 1 < value.length() ? value.charAt(at + 1) : ' ';
    }

    /** ponytail: {@code #} is never quoted, so a literal # inside a plural needs the ICU view. */
    private static void write(StringBuilder pattern, List<Node> nodes) {
        for (Node node : nodes) {
            switch (node) {
                case Node.Text text -> {
                    String value = text.value();
                    for (int i = 0; i < value.length(); i++) {
                        char c = value.charAt(i);
                        // An apostrophe only quotes what follows it, so only those need doubling:
                        // escaping every one of them grows the pattern on every save.
                        if (c == '\'') pattern.append(QUOTES.indexOf(next(value, i)) < 0 ? "'" : "''");
                        else if (c == '{' || c == '}') pattern.append('\'').append(c).append('\'');
                        else pattern.append(c);
                    }
                }
                case Node.Hole hole -> {
                    pattern.append('{').append(hole.argument());
                    if (hole.format() != null) pattern.append(", ").append(hole.format());
                    if (hole.format() != null && hole.style() != null) pattern.append(", ").append(hole.style());
                    pattern.append('}');
                }
                case Node.Choice choice -> {
                    pattern.append('{').append(choice.argument()).append(", ").append(choice.kind().toLowerCase()).append(',');
                    if (choice.offset() != 0) pattern.append(" offset:").append(plain(choice.offset()));
                    for (Node.Branch branch : choice.branches()) {
                        pattern.append(' ').append(branch.match()).append(" {");
                        write(pattern, branch.body());
                        pattern.append('}');
                    }
                    pattern.append('}');
                }
            }
        }
    }

    /** A few of CLDR's own sample numbers per category, so an editor can show what {@code few} means in this locale. */
    private static Map<String, List<String>> samples(PluralRules rules, Set<String> categories) {
        Map<String, List<String>> samples = new TreeMap<>();
        for (String category : categories) {
            Collection<Double> values = rules.getSamples(category);
            if (values != null) samples.put(category, values.stream().limit(4).map(MessageType::plain).toList());
        }
        return samples;
    }

    private static String plain(double value) {
        return value == Math.rint(value) ? Long.toString((long) value) : Double.toString(value);
    }

    /** Whether exact matches already cover every sample CLDR gives for {@code category}. */
    private static boolean coveredByExactMatches(PluralRules rules, String category, double offset, Set<Double> exact) {
        if (category.equals("other")) return false;
        Collection<Double> integers = rules.getAllKeywordValues(category);
        var decimals = rules.getAllKeywordValues(category, PluralRules.SampleType.DECIMAL);
        if (integers == null || decimals == null) return false;
        return integers.stream().allMatch(n -> exact.contains(n + offset))
                && decimals.stream().allMatch(n -> exact.contains(n.toDouble() + offset));
    }

    private static void expect(String name, Variable variable, VariableType expected) {
        if (variable.type() != expected) throw HttpException.badRequest("Declare " + name + " as " + expected + ".");
    }

    private static Object argument(String name, Variable variable, Object value, String locale) {
        boolean valid = switch (variable.type()) {
            case TEXT, TEMPORAL -> value instanceof String;
            case NUMBER -> value instanceof Number number && Double.isFinite(number.doubleValue());
            case SELECT -> value instanceof String text && variable.values().contains(text);
            case BOOLEAN -> value instanceof Boolean;
        };
        if (!valid) throw HttpException.badRequest("Invalid value for " + name + ".");
        if (variable.type() == VariableType.BOOLEAN) return value.toString();
        if (variable.type() != VariableType.TEMPORAL) return value;
        try {
            Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"), ULocale.forLanguageTag(locale));
            calendar.setTimeInMillis(Instant.parse((String) value).toEpochMilli());
            return calendar;
        } catch (RuntimeException invalid) {
            throw HttpException.badRequest("Pass " + name + " as an ISO-8601 instant.");
        }
    }

    private static MessageFormat formatter(String pattern, String locale) {
        MessageFormat format = new MessageFormat(pattern, ULocale.forLanguageTag(locale));
        for (Format element : format.getFormats()) {
            if (element instanceof DateFormat date) date.setTimeZone(TimeZone.getTimeZone("UTC"));
        }
        return format;
    }
}
