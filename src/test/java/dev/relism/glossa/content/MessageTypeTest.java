package dev.relism.glossa.content;

import dev.relism.flash.exceptions.HttpException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** §6's ICU profile on its own, without persistence or a transport. */
class MessageTypeTest {

    private final MessageType messages = new MessageType();

    private static Map<String, Object> pattern(String value) {
        return Map.of("pattern", value);
    }

    private static FieldType.Variable number() {
        return new FieldType.Variable(FieldType.VariableType.NUMBER, List.of());
    }

    private static FieldType.Variable select(String... values) {
        return new FieldType.Variable(FieldType.VariableType.SELECT, List.of(values));
    }

    private static FieldType.Variable temporal() {
        return new FieldType.Variable(FieldType.VariableType.TEMPORAL, List.of());
    }

    @Test
    void cldrCompletenessUsesTheRealLocaleRules() {
        Map<String, FieldType.Variable> contract = Map.of("count", number());

        messages.analyze(pattern("{count, plural, zero{صفر} one{واحد} two{اثنان} few{قليل} many{كثير} other{آخر}}"), contract, "ar", true);
        assertEquals(List.of("few", "many", "one", "other", "two", "zero"), List.copyOf(MessageType.forms("ar", false).keySet()));
        assertTrue(MessageType.forms("it-IT", false).get("many").contains("1000000"));

        var italian = messages.analyze(pattern("{count, plural, one{# elemento} many{# milioni di elementi} other{# elementi}}"), contract, "it-IT", true);
        assertEquals(List.of("many", "one", "other"), italian.structure().stream().map(n -> ((Node.Choice) n).branches()).findFirst().orElseThrow()
                .stream().map(Node.Branch::match).sorted().toList());

        // Exact matches may stand in for a category, missing branches may not.
        messages.analyze(pattern("{count, plural, =1{one} other{many}}"), contract, "en", true);
        assertThrows(HttpException.class, () -> messages.analyze(pattern("{count, plural, one{one} other{other}}"), contract, "it", true));
    }

    @Test
    void cardinalOrdinalExactOffsetNestingAndEscapingRenderThroughIcu() {
        Map<String, FieldType.Variable> contract = Map.of("gender", select("female", "male"), "place", number());
        String text = "{gender, select, "
                + "female{{place, selectordinal, offset:0 one{She''s #st} two{She''s #nd} few{She''s #rd} other{She''s #th}}} "
                + "male{{place, selectordinal, one{He''s #st} two{He''s #nd} few{He''s #rd} other{He''s #th}}} "
                + "other{They placed}}";
        assertEquals("She's 22nd", messages.render(pattern(text), contract, "en", Map.of("gender", "female", "place", 22)));
    }

    @Test
    void theContractRejectsEveryDynamicHole() {
        assertThrows(HttpException.class, () -> messages.validate(pattern("Hi {name}"), Map.of(), "en", false));
        assertThrows(HttpException.class, () -> messages.validate(pattern("{count, plural, other{x}}"),
                Map.of("count", new FieldType.Variable(FieldType.VariableType.TEXT, List.of())), "en", false));
        assertThrows(HttpException.class, () -> messages.validate(pattern("{count, choice, 0#none|1#one}"), Map.of("count", number()), "en", false));
        assertThrows(HttpException.class, () -> messages.validate(pattern("{0}"), Map.of(), "en", false));
        assertThrows(HttpException.class, () -> messages.render(pattern("{plan, select, pro{Pro} other{Free}}"),
                Map.of("plan", select("free", "pro")), "en", Map.of("plan", "enterprise")));
        assertThrows(HttpException.class, () -> messages.render(pattern("{count, number}"), Map.of("count", number()), "en", Map.of("count", Double.NaN)));
    }

    /** Discovery is depth-blind: where a name first appears cannot decide whether it is found. */
    @Test
    void theContractIsDiscoveredAtEveryDepthAndTypedByUse() {
        String text = """
                {paymentStatus, select,
                  paid {
                    {daysUntil, plural,
                      =0 {L'evento è oggi.}
                      one {L'evento è tra # giorno.}
                      other {L'evento è tra # giorni.}
                    }
                  }
                  other {Pagamento non disponibile.}
                }""";
        Map<String, FieldType.Variable> contract = messages.contractOf(pattern(text));
        assertEquals(Set.of("paymentStatus", "daysUntil"), contract.keySet());
        assertEquals(FieldType.VariableType.NUMBER, contract.get("daysUntil").type());
        assertEquals(List.of("paid"), contract.get("paymentStatus").values());
        // What discovery found is exactly what validation asks to be declared.
        messages.analyze(pattern(text), contract, "it-IT", false);

        assertEquals(FieldType.VariableType.NUMBER, messages.contractOf(pattern("{n} of {n, plural, other {#}}")).get("n").type());
        assertEquals(FieldType.VariableType.TEMPORAL, messages.contractOf(pattern("{at, date, ::yMMMd}")).get("at").type());
        assertEquals(FieldType.VariableType.BOOLEAN, messages.contractOf(pattern("{on, select, true {y} false {n} other {?}}")).get("on").type());
        assertEquals(List.of("a", "b"), messages.contractOf(pattern("{k, select, a {1} other {2}} {k, select, b {3} other {4}}")).get("k").values());
        assertThrows(HttpException.class, () -> messages.contractOf(pattern("{value, plural, other {#}} {value, select, a {x} other {y}}")));
    }

    /** What the editor renders: a tree, so it never reads or writes ICU syntax itself. */
    @Test
    void theStructureCarriesEveryBranchItsSamplesAndTheTextAround() {
        String text = "You have {count, plural, one {# message} other {# messages}} waiting";
        var analysis = messages.analyze(pattern(text), Map.of("count", number()), "en", true);

        assertEquals(List.of(new Node.Text("You have "), choice(analysis), new Node.Text(" waiting")), analysis.structure());
        assertEquals(List.of("one", "other"), choice(analysis).branches().stream().map(Node.Branch::match).toList());
        assertEquals(List.of(new Node.Text("# message")), choice(analysis).branches().getFirst().body());
        assertEquals(text, analysis.payload().get("pattern"));
    }

    /** Parsing and composing are one another's inverse, escaping and nesting included. */
    @Test
    void everyShapeSurvivesTheRoundTrip() {
        List<String> patterns = List.of(
                "plain text",
                "It''s {name}, '{'not a hole'}' and 100%",
                "L'evento e dell'anno, {n, plural, other {# giorni}}",
                "{total, number, ::currency/EUR} on {due, date, ::yMMMd}",
                "{count, plural, offset:1 =0 {none} one {# other} other {# others}}",
                "{paymentStatus, select, paid{{daysUntil, plural, =0{Today} one{In # day} other{In # days}}} other{Unavailable}}");
        for (String text : patterns) {
            List<Node> once = messages.structureOf(pattern(text), "en");
            Map<String, Object> composed = messages.payloadOf(once);
            assertEquals(once, messages.structureOf(composed, "en"), text);
            // And the composed pattern still says the same thing to ICU.
            var contract = messages.contractOf(pattern(text));
            assertEquals(messages.contractOf(composed), contract, text);
            // Saving must never grow a message: an over-escaped apostrophe may shrink, none may double.
            assertTrue(count((String) composed.get("pattern"), '\'') <= count(text, '\''), text);
        }
        assertEquals("It's Ada, {not a hole} and 100%",
                messages.render(pattern("It''s {name}, '{'not a hole'}' and 100%"),
                        Map.of("name", new FieldType.Variable(FieldType.VariableType.TEXT, List.of())), "en", Map.of("name", "Ada")));
    }

    private static long count(String text, char c) {
        return text.chars().filter(x -> x == c).count();
    }

    private static Node.Choice choice(MessageType.Analysis analysis) {
        return analysis.structure().stream().filter(Node.Choice.class::isInstance).map(Node.Choice.class::cast).findFirst().orElseThrow();
    }

    @Test
    void localesAndTemporalValuesAreCanonicalAndTyped() {
        assertEquals("pt-BR", MessageType.locale("pt-br"));
        assertThrows(HttpException.class, () -> MessageType.locale("x-private"));
        assertTrue(messages.analyze(pattern("مرحبا"), Map.of(), "ar", false).rtl());
        assertThrows(HttpException.class, () -> messages.render(pattern("{at, date, ::yMMMd}"), Map.of("at", temporal()), "en", Map.of("at", "tomorrow")));
        assertTrue(messages.render(pattern("{at, date, ::yMMMd}"), Map.of("at", temporal()), "en", Map.of("at", "2026-09-15T00:00:00Z")).contains("2026"));
    }
}
