/*
 * ZemberekServer — minimal HTTP wrapper around Zemberek-NLP that exposes
 * a LanguageTool-compatible /v2/check endpoint.
 *
 * Why this exists
 *   AcademiQ's renderer already speaks the LanguageTool /v2/check JSON
 *   protocol (see src/renderer/lib/languagetool.ts). Zemberek itself is
 *   a library, not a server, and ships no HTTP entry point. This file is
 *   the smallest possible adapter: takes urlencoded `text=...&language=tr-TR`,
 *   runs Zemberek's spell-checker + suggestions, returns the result in the
 *   LT match shape (offset / length / message / replacements[]).
 *
 * Build
 *   This file is compiled by scripts/setup-zemberek.js into a fat JAR at
 *   vendor/languagetool/zemberek-server.jar (see README near that script).
 *
 * Why JDK built-in HttpServer
 *   The com.sun.net.httpserver package is part of the JRE since Java 6.
 *   Using it means zero external HTTP library dependencies and a fat-JAR
 *   that is only as big as Zemberek + Guava (~30 MB), no Spring/Jetty.
 */
package academiq.zemberek;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import zemberek.morphology.TurkishMorphology;
import zemberek.normalization.TurkishSpellChecker;
import zemberek.tokenization.TurkishTokenizer;
import zemberek.tokenization.Token;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public class ZemberekServer {

    private static volatile TurkishMorphology morphology;
    private static volatile TurkishSpellChecker spellChecker;
    private static volatile TurkishTokenizer tokenizer;

    public static void main(String[] args) throws Exception {
        int port = 8087;
        for (int i = 0; i + 1 < args.length; i++) {
            if ("--port".equals(args[i])) {
                try { port = Integer.parseInt(args[i + 1]); } catch (NumberFormatException ignored) {}
            }
        }

        System.out.println("[zemberek-server] loading TurkishMorphology... this takes ~5-10s on cold start");
        morphology = TurkishMorphology.createWithDefaults();
        spellChecker = new TurkishSpellChecker(morphology);
        tokenizer = TurkishTokenizer.DEFAULT;
        System.out.println("[zemberek-server] morphology ready, starting HTTP on :" + port);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/v2/check", ZemberekServer::handleCheck);
        server.createContext("/v2/languages", ZemberekServer::handleLanguages);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("[zemberek-server] listening on http://127.0.0.1:" + port);
    }

    private static void addCors(HttpExchange ex) {
        ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().add("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        ex.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void handleLanguages(HttpExchange ex) throws IOException {
        addCors(ex);
        if ("OPTIONS".equals(ex.getRequestMethod())) { ex.sendResponseHeaders(204, -1); ex.close(); return; }
        String body = "[{\"name\":\"Turkish\",\"code\":\"tr\",\"longCode\":\"tr-TR\"}]";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }

    private static void handleCheck(HttpExchange ex) throws IOException {
        addCors(ex);
        String method = ex.getRequestMethod();
        if ("OPTIONS".equals(method)) { ex.sendResponseHeaders(204, -1); ex.close(); return; }
        if (!"POST".equals(method) && !"GET".equals(method)) {
            ex.sendResponseHeaders(405, -1); ex.close(); return;
        }

        Map<String, String> params = parseParams(ex);
        String text = params.getOrDefault("text", "");
        // language param is accepted but ignored — we only do tr.

        List<Match> matches = new ArrayList<>();
        try {
            if (!text.isEmpty()) {
                List<Token> tokens = tokenizer.tokenize(text);
                for (Token token : tokens) {
                    if (token.getType() != Token.Type.Word) continue;
                    String word = token.getText();
                    if (word.length() <= 1) continue;
                    if (spellChecker.check(word)) continue;
                    // Misspelled — collect up to 5 suggestions.
                    List<String> suggestions;
                    try {
                        suggestions = spellChecker.suggestForWord(word);
                    } catch (Exception suggestErr) {
                        suggestions = Collections.emptyList();
                    }
                    Match m = new Match();
                    m.offset = token.getStart();
                    m.length = token.getEnd() - token.getStart() + 1;
                    m.message = "Olası yazım hatası";
                    m.shortMessage = "Yazım";
                    m.ruleId = "ZEMBEREK_SPELL_TR";
                    m.categoryId = "TYPOS";
                    m.replacements = suggestions.size() > 5 ? suggestions.subList(0, 5) : suggestions;
                    matches.add(m);
                }
            }
        } catch (Exception err) {
            // Never let a single bad token take the whole request down.
            System.err.println("[zemberek-server] check error: " + err.getMessage());
        }

        byte[] bytes = renderResponse(matches).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }

    // ───────────────────────────────────────────────────────────────────
    // Helpers
    // ───────────────────────────────────────────────────────────────────

    private static Map<String, String> parseParams(HttpExchange ex) throws IOException {
        Map<String, String> out = new HashMap<>();
        // POST body first
        if ("POST".equals(ex.getRequestMethod())) {
            byte[] data = ex.getRequestBody().readAllBytes();
            String body = new String(data, StandardCharsets.UTF_8);
            parseUrlencoded(body, out);
        }
        // GET / query overlay
        String query = ex.getRequestURI().getRawQuery();
        if (query != null && !query.isEmpty()) parseUrlencoded(query, out);
        return out;
    }

    private static void parseUrlencoded(String body, Map<String, String> sink) {
        if (body == null || body.isEmpty()) return;
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            try {
                String k = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
                String v = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                sink.put(k, v);
            } catch (Exception ignored) {}
        }
    }

    /** Minimal JSON renderer — Zemberek doesn't pull in a JSON lib by default and we don't want
     *  to grow the fat-jar for a single response shape. */
    private static String renderResponse(List<Match> matches) {
        StringBuilder sb = new StringBuilder(256 + 80 * matches.size());
        sb.append("{\"software\":{\"name\":\"AcademiQ-Zemberek\",\"version\":\"1.0\"},");
        sb.append("\"language\":{\"name\":\"Turkish\",\"code\":\"tr-TR\"},");
        sb.append("\"matches\":[");
        for (int i = 0; i < matches.size(); i++) {
            if (i > 0) sb.append(',');
            Match m = matches.get(i);
            sb.append("{\"message\":").append(jsonString(m.message))
              .append(",\"shortMessage\":").append(jsonString(m.shortMessage))
              .append(",\"offset\":").append(m.offset)
              .append(",\"length\":").append(m.length)
              .append(",\"replacements\":[");
            for (int j = 0; j < m.replacements.size(); j++) {
                if (j > 0) sb.append(',');
                sb.append("{\"value\":").append(jsonString(m.replacements.get(j))).append('}');
            }
            sb.append("],\"rule\":{")
              .append("\"id\":").append(jsonString(m.ruleId))
              .append(",\"category\":{\"id\":").append(jsonString(m.categoryId)).append('}')
              .append("}}");
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String jsonString(String s) {
        if (s == null) return "\"\"";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                case '\b': sb.append("\\b");  break;
                case '\f': sb.append("\\f");  break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    static final class Match {
        int offset;
        int length;
        String message = "";
        String shortMessage = "";
        String ruleId = "";
        String categoryId = "";
        List<String> replacements = Collections.emptyList();
    }
}
