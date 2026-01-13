package com.openshift.dashboard.agent;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.instrument.Instrumentation;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;

public class SpringConfigAgent {
    private static final int DEFAULT_MAX_CHARS = 200_000;
    private static final List<String> RESOURCE_NAMES = Arrays.asList(
        "application.properties",
        "application.yml",
        "application.yaml",
        "bootstrap.properties",
        "bootstrap.yml",
        "bootstrap.yaml",
        "config/application.properties",
        "config/application.yml",
        "config/application.yaml",
        "config/bootstrap.properties",
        "config/bootstrap.yml",
        "config/bootstrap.yaml"
    );

    public static void premain(String agentArgs, Instrumentation instrumentation) {
        runAgent(agentArgs);
    }

    public static void agentmain(String agentArgs, Instrumentation instrumentation) {
        runAgent(agentArgs);
    }

    public static void main(String[] args) {
        String agentArgs = args == null || args.length == 0 ? "" : String.join(",", args);
        runAgent(agentArgs);
    }

    private static void runAgent(String agentArgs) {
        Map<String, String> argsMap = parseArgs(agentArgs);
        int maxChars = DEFAULT_MAX_CHARS;
        if (argsMap.containsKey("maxChars")) {
            try {
                maxChars = Integer.parseInt(argsMap.get("maxChars"));
            } catch (NumberFormatException ignored) {
                maxChars = DEFAULT_MAX_CHARS;
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("metadata", buildMetadata(agentArgs, maxChars));
        payload.put("systemProperties", buildSystemProperties());
        payload.put("environment", buildEnvironment());
        payload.put("classpathResources", buildClasspathResources(maxChars));
        payload.put("files", buildFilesystemMatches(maxChars));

        String json = toJson(payload);
        String outputPath = argsMap.get("output");
        writeOutput(outputPath, json);
    }

    private static Map<String, Object> buildMetadata(String agentArgs, int maxChars) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("timestamp", Instant.now().toString());
        metadata.put("pid", resolvePid());
        metadata.put("javaVersion", System.getProperty("java.version", ""));
        metadata.put("javaVendor", System.getProperty("java.vendor", ""));
        metadata.put("user", System.getProperty("user.name", ""));
        metadata.put("userDir", System.getProperty("user.dir", ""));
        metadata.put("hostname", resolveHostname());
        metadata.put("agentArgs", agentArgs == null ? "" : agentArgs);
        metadata.put("maxContentChars", maxChars);
        return metadata;
    }

    private static Map<String, String> buildSystemProperties() {
        Properties properties = System.getProperties();
        Map<String, String> data = new TreeMap<>();
        for (String name : properties.stringPropertyNames()) {
            data.put(name, properties.getProperty(name));
        }
        return data;
    }

    private static Map<String, String> buildEnvironment() {
        Map<String, String> env = new TreeMap<>();
        env.putAll(System.getenv());
        return env;
    }

    private static Map<String, Object> buildClasspathResources(int maxChars) {
        Map<String, Object> result = new LinkedHashMap<>();
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        if (loader == null) {
            loader = SpringConfigAgent.class.getClassLoader();
        }

        for (String resourceName : RESOURCE_NAMES) {
            List<Map<String, Object>> entries = new ArrayList<>();
            try {
                Enumeration<URL> urls = loader.getResources(resourceName);
                while (urls.hasMoreElements()) {
                    URL url = urls.nextElement();
                    ContentPayload payload = readUrl(url, maxChars);
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("name", resourceName);
                    entry.put("location", url.toString());
                    entry.put("sizeBytes", payload.sizeBytes);
                    entry.put("truncated", payload.truncated);
                    entry.put("content", payload.content);
                    entries.add(entry);
                }
            } catch (IOException ignored) {
                entries = Collections.emptyList();
            }

            if (!entries.isEmpty()) {
                result.put(resourceName, entries);
            }
        }

        return result;
    }

    private static Map<String, Object> buildFilesystemMatches(int maxChars) {
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> searchPaths = new ArrayList<>();
        List<Map<String, Object>> matches = new ArrayList<>();

        List<Path> basePaths = new ArrayList<>();
        String userDir = System.getProperty("user.dir", "");
        if (!userDir.isEmpty()) {
            basePaths.add(Paths.get(userDir));
            basePaths.add(Paths.get(userDir, "config"));
        }
        basePaths.addAll(resolveSpringConfigPaths());

        for (Path base : basePaths) {
            searchPaths.add(base.toString());
            for (String resourceName : RESOURCE_NAMES) {
                Path candidate = base.resolve(resourceName);
                if (!Files.exists(candidate) || !Files.isRegularFile(candidate)) {
                    continue;
                }
                ContentPayload payload = readFile(candidate, maxChars);
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("path", candidate.toString());
                entry.put("sizeBytes", payload.sizeBytes);
                entry.put("truncated", payload.truncated);
                entry.put("content", payload.content);
                matches.add(entry);
            }
        }

        data.put("searchPaths", searchPaths);
        data.put("matches", matches);
        return data;
    }

    private static List<Path> resolveSpringConfigPaths() {
        List<Path> paths = new ArrayList<>();
        String rawLocations = firstNonEmpty(
            System.getenv("SPRING_CONFIG_LOCATION"),
            System.getenv("SPRING_CONFIG_ADDITIONAL_LOCATION")
        );
        if (rawLocations == null || rawLocations.isEmpty()) {
            return paths;
        }
        String[] tokens = rawLocations.split("[,;]");
        for (String token : tokens) {
            String normalized = token.trim();
            if (normalized.isEmpty()) {
                continue;
            }
            normalized = normalized.replaceFirst("^optional:", "");
            normalized = normalized.replaceFirst("^file:", "");
            if (normalized.startsWith("classpath:") || normalized.startsWith("http")) {
                continue;
            }
            paths.add(Paths.get(normalized));
        }
        return paths;
    }

    private static ContentPayload readFile(Path path, int maxChars) {
        try (InputStream stream = Files.newInputStream(path)) {
            return readStream(stream, maxChars);
        } catch (IOException exc) {
            return new ContentPayload("", 0, false);
        }
    }

    private static ContentPayload readUrl(URL url, int maxChars) {
        try (InputStream stream = url.openStream()) {
            return readStream(stream, maxChars);
        } catch (IOException exc) {
            return new ContentPayload("", 0, false);
        }
    }

    private static ContentPayload readStream(InputStream stream, int maxChars) throws IOException {
        if (stream == null) {
            return new ContentPayload("", 0, false);
        }
        int max = Math.max(0, maxChars);
        StringBuilder builder = new StringBuilder();
        long bytes = 0;
        boolean truncated = false;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) >= 0) {
                bytes += read;
                if (builder.length() < max) {
                    int remaining = max - builder.length();
                    builder.append(buffer, 0, Math.min(read, remaining));
                    if (read > remaining) {
                        truncated = true;
                        break;
                    }
                } else {
                    truncated = true;
                    break;
                }
            }
        }
        return new ContentPayload(builder.toString(), bytes, truncated);
    }

    private static void writeOutput(String outputPath, String payload) {
        if (outputPath == null || outputPath.trim().isEmpty()) {
            System.out.println(payload);
            return;
        }
        Path path = Paths.get(outputPath.trim());
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            try (OutputStream outputStream = Files.newOutputStream(path)) {
                outputStream.write(payload.getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException exc) {
            System.err.println("Failed to write output: " + exc.getMessage());
            System.out.println(payload);
        }
    }

    private static Map<String, String> parseArgs(String agentArgs) {
        if (agentArgs == null || agentArgs.trim().isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, String> args = new LinkedHashMap<>();
        String[] tokens = agentArgs.split("[,;]");
        for (String token : tokens) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String[] parts = trimmed.split("=", 2);
            if (parts.length == 2) {
                args.put(parts[0].trim(), parts[1].trim());
            } else {
                args.put(parts[0].trim(), "");
            }
        }
        return args;
    }

    private static String resolvePid() {
        String runtimeName = ManagementFactory.getRuntimeMXBean().getName();
        if (runtimeName == null) {
            return "";
        }
        int at = runtimeName.indexOf('@');
        return at > 0 ? runtimeName.substring(0, at) : runtimeName;
    }

    private static String resolveHostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception exc) {
            return "";
        }
    }

    private static String firstNonEmpty(String first, String second) {
        if (first != null && !first.trim().isEmpty()) {
            return first.trim();
        }
        if (second != null && !second.trim().isEmpty()) {
            return second.trim();
        }
        return null;
    }

    private static String toJson(Object value) {
        StringBuilder builder = new StringBuilder();
        appendJson(builder, value);
        return builder.toString();
    }

    private static void appendJson(StringBuilder builder, Object value) {
        if (value == null) {
            builder.append("null");
            return;
        }
        if (value instanceof String) {
            builder.append('"');
            escapeJson(builder, (String) value);
            builder.append('"');
            return;
        }
        if (value instanceof Number || value instanceof Boolean) {
            builder.append(value.toString());
            return;
        }
        if (value instanceof Map) {
            builder.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                builder.append('"');
                escapeJson(builder, String.valueOf(entry.getKey()));
                builder.append('"').append(':');
                appendJson(builder, entry.getValue());
            }
            builder.append('}');
            return;
        }
        if (value instanceof List) {
            builder.append('[');
            boolean first = true;
            for (Object item : (List<?>) value) {
                if (!first) {
                    builder.append(',');
                }
                first = false;
                appendJson(builder, item);
            }
            builder.append(']');
            return;
        }
        builder.append('"');
        escapeJson(builder, value.toString());
        builder.append('"');
    }

    private static void escapeJson(StringBuilder builder, String value) {
        for (int i = 0; i < value.length(); i += 1) {
            char c = value.charAt(i);
            switch (c) {
                case '"':
                    builder.append("\\\"");
                    break;
                case '\\':
                    builder.append("\\\\");
                    break;
                case '\b':
                    builder.append("\\b");
                    break;
                case '\f':
                    builder.append("\\f");
                    break;
                case '\n':
                    builder.append("\\n");
                    break;
                case '\r':
                    builder.append("\\r");
                    break;
                case '\t':
                    builder.append("\\t");
                    break;
                default:
                    if (c < 0x20) {
                        builder.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        builder.append(c);
                    }
            }
        }
    }

    private static class ContentPayload {
        private final String content;
        private final long sizeBytes;
        private final boolean truncated;

        private ContentPayload(String content, long sizeBytes, boolean truncated) {
            this.content = content;
            this.sizeBytes = sizeBytes;
            this.truncated = truncated;
        }
    }
}
