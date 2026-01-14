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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.TreeMap;
import org.springframework.security.crypto.encrypt.Encryptors;
import org.springframework.security.crypto.encrypt.TextEncryptor;

public class SpringConfigAgent {
    private static final int DEFAULT_MAX_CHARS = 200_000;
    private static final int DEFAULT_MAX_FILES = 120;
    private static final int DEFAULT_MAX_JARS = 20;
    private static final int DEFAULT_MAX_DEPTH = 6;
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
    private static final List<String> DEFAULT_SEARCH_DIRS = Arrays.asList(
        ".",
        "./config",
        "/app",
        "/app/config",
        "/deployments",
        "/deployments/config",
        "/opt/app",
        "/opt/app/config",
        "/workspace",
        "/workspace/config",
        "/usr/app",
        "/usr/app/config",
        "/config"
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
        int maxFiles = parseIntArg(argsMap.get("maxFiles"), DEFAULT_MAX_FILES);
        int maxJars = parseIntArg(argsMap.get("maxJars"), DEFAULT_MAX_JARS);
        int maxDepth = parseIntArg(argsMap.get("maxDepth"), DEFAULT_MAX_DEPTH);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("metadata", buildMetadata(agentArgs, maxChars));
        payload.put("systemProperties", buildSystemProperties());
        payload.put("environment", buildEnvironment());
        Map<String, Object> classpathResources = buildClasspathResources(maxChars);
        Map<String, Object> fileResources = buildFilesystemMatches(maxChars, maxFiles, maxDepth, argsMap);
        Map<String, Object> jarResources = buildJarResourceMatches(maxChars, maxJars, maxDepth, argsMap);
        payload.put("classpathResources", classpathResources);
        payload.put("files", fileResources);
        payload.put("jarResources", jarResources);
        payload.put("configServer", fetchConfigServer(maxChars, classpathResources, fileResources, jarResources));

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

    private static Map<String, Object> buildFilesystemMatches(
        int maxChars,
        int maxFiles,
        int maxDepth,
        Map<String, String> argsMap
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> searchPaths = new ArrayList<>();
        List<Map<String, Object>> matches = new ArrayList<>();

        List<Path> basePaths = resolveSearchRoots(argsMap);

        for (Path base : basePaths) {
            searchPaths.add(base.toString());
            matches.addAll(findConfigFiles(base, maxChars, maxFiles, maxDepth, matches.size()));
            if (matches.size() >= maxFiles) {
                break;
            }
        }

        data.put("searchPaths", searchPaths);
        data.put("matches", matches);
        return data;
    }

    private static Map<String, Object> buildJarResourceMatches(
        int maxChars,
        int maxJars,
        int maxDepth,
        Map<String, String> argsMap
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> searchPaths = new ArrayList<>();
        List<Map<String, Object>> matches = new ArrayList<>();
        List<Path> basePaths = resolveSearchRoots(argsMap);

        for (Path base : basePaths) {
            searchPaths.add(base.toString());
            matches.addAll(findJarResources(base, maxChars, maxJars, maxDepth, matches.size()));
            if (matches.size() >= maxJars) {
                break;
            }
        }

        data.put("searchPaths", searchPaths);
        data.put("matches", matches);
        return data;
    }

    private static List<Path> resolveSearchRoots(Map<String, String> argsMap) {
        List<Path> basePaths = new ArrayList<>();
        String userDir = System.getProperty("user.dir", "");
        if (!userDir.isEmpty()) {
            basePaths.add(Paths.get(userDir));
            basePaths.add(Paths.get(userDir, "config"));
        }
        for (String pathValue : DEFAULT_SEARCH_DIRS) {
            basePaths.add(Paths.get(pathValue));
        }
        basePaths.addAll(resolveSpringConfigPaths());
        String argPaths = argsMap.get("searchPaths");
        if (argPaths != null && !argPaths.trim().isEmpty()) {
            for (String token : argPaths.split("[,;]")) {
                String trimmed = token.trim();
                if (!trimmed.isEmpty()) {
                    basePaths.add(Paths.get(trimmed));
                }
            }
        }
        return basePaths;
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

    private static List<Map<String, Object>> findConfigFiles(
        Path base,
        int maxChars,
        int maxFiles,
        int maxDepth,
        int alreadyFound
    ) {
        List<Map<String, Object>> matches = new ArrayList<>();
        if (!Files.exists(base)) {
            return matches;
        }
        try {
            Files.walk(base, Math.max(1, maxDepth))
                .filter(path -> Files.isRegularFile(path))
                .filter(SpringConfigAgent::isConfigFileName)
                .forEach(path -> {
                    if (matches.size() + alreadyFound >= maxFiles) {
                        return;
                    }
                    ContentPayload payload = readFile(path, maxChars);
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("path", path.toString());
                    entry.put("sizeBytes", payload.sizeBytes);
                    entry.put("truncated", payload.truncated);
                    entry.put("content", payload.content);
                    matches.add(entry);
                });
        } catch (IOException ignored) {
            return matches;
        }
        return matches;
    }

    private static List<Map<String, Object>> findJarResources(
        Path base,
        int maxChars,
        int maxJars,
        int maxDepth,
        int alreadyFound
    ) {
        List<Map<String, Object>> matches = new ArrayList<>();
        if (!Files.exists(base)) {
            return matches;
        }
        try {
            Files.walk(base, Math.max(1, maxDepth))
                .filter(path -> Files.isRegularFile(path))
                .filter(path -> path.toString().endsWith(".jar"))
                .forEach(path -> {
                    if (matches.size() + alreadyFound >= maxJars) {
                        return;
                    }
                    Map<String, Object> entry = readJarConfigEntries(path, maxChars);
                    if (entry != null) {
                        matches.add(entry);
                    }
                });
        } catch (IOException ignored) {
            return matches;
        }
        return matches;
    }

    private static Map<String, Object> readJarConfigEntries(Path jarPath, int maxChars) {
        try (java.util.jar.JarFile jarFile = new java.util.jar.JarFile(jarPath.toFile())) {
            Map<String, Object> jarEntry = new LinkedHashMap<>();
            jarEntry.put("jarPath", jarPath.toString());
            List<Map<String, Object>> entries = new ArrayList<>();
            java.util.Enumeration<java.util.jar.JarEntry> jarEntries = jarFile.entries();
            while (jarEntries.hasMoreElements()) {
                java.util.jar.JarEntry entry = jarEntries.nextElement();
                String name = entry.getName();
                if (isConfigResourceName(name)) {
                    ContentPayload payload = readStream(jarFile.getInputStream(entry), maxChars);
                    Map<String, Object> record = new LinkedHashMap<>();
                    record.put("name", name);
                    record.put("sizeBytes", payload.sizeBytes);
                    record.put("truncated", payload.truncated);
                    record.put("content", payload.content);
                    entries.add(record);
                }
            }
            if (entries.isEmpty()) {
                return null;
            }
            jarEntry.put("entries", entries);
            return jarEntry;
        } catch (IOException ignored) {
            return null;
        }
    }

    private static boolean isConfigFileName(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return isConfigBaseName(name);
    }

    private static boolean isConfigResourceName(String name) {
        String normalized = name.toLowerCase(Locale.ROOT);
        int lastSlash = normalized.lastIndexOf('/');
        String baseName = lastSlash >= 0 ? normalized.substring(lastSlash + 1) : normalized;
        return isConfigBaseName(baseName);
    }

    private static boolean isConfigBaseName(String baseName) {
        return (baseName.startsWith("application")
            && (baseName.endsWith(".yml") || baseName.endsWith(".yaml") || baseName.endsWith(".properties")))
            || (baseName.startsWith("bootstrap")
            && (baseName.endsWith(".yml") || baseName.endsWith(".yaml") || baseName.endsWith(".properties")));
    }

    private static Map<String, Object> fetchConfigServer(
        int maxChars,
        Map<String, Object> classpathResources,
        Map<String, Object> fileResources,
        Map<String, Object> jarResources
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        List<String> activeProfiles = resolveActiveProfiles();
        ConfigHints hints = buildConfigHints(classpathResources, fileResources, jarResources, activeProfiles);
        String configServerUrl = resolveConfigServerUrl(hints);
        if (configServerUrl == null || configServerUrl.isEmpty()) {
            return data;
        }
        String appName = firstNonEmpty(
            System.getenv("SPRING_APPLICATION_NAME"),
            System.getenv("SPRING_CLOUD_CONFIG_NAME")
        );
        if (appName == null || appName.isEmpty()) {
            appName = firstNonEmpty(hints.applicationName, "application");
        }
        String profile = firstNonEmpty(
            System.getenv("SPRING_PROFILES_ACTIVE"),
            System.getenv("SPRING_CLOUD_CONFIG_PROFILE")
        );
        if (profile == null || profile.isEmpty()) {
            profile = firstNonEmpty(hints.profile, "default");
        }

        String requestUrl = configServerUrl;
        if (!requestUrl.endsWith("/")) {
            requestUrl += "/";
        }
        requestUrl += appName + "/" + profile;

        data.put("url", requestUrl);
        data.put("source", hints.source);
        try {
            URL url = new URL(requestUrl);
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
        String username = firstNonEmpty(
            System.getenv("SPRING_CLOUD_CONFIG_USERNAME"),
            hints.username
        );
        String password = firstNonEmpty(
            System.getenv("SPRING_CLOUD_CONFIG_PASSWORD"),
            hints.password
        );
        String encryptKey = firstNonEmpty(
            System.getenv("ENCRYPT_KEY"),
            hints.encryptKey
        );
        if (password != null) {
            password = decryptIfPossible(password, encryptKey);
        }
        if (username != null && !username.isEmpty() && password != null) {
            String token = java.util.Base64.getEncoder().encodeToString(
                (username + ":" + password).getBytes(StandardCharsets.UTF_8)
            );
            connection.setRequestProperty("Authorization", "Basic " + token);
        }
            int status = connection.getResponseCode();
            data.put("status", status);
            InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
            if (stream != null) {
                ContentPayload payload = readStream(stream, maxChars);
                data.put("truncated", payload.truncated);
                data.put("content", payload.content);
            }
        } catch (Exception exc) {
            data.put("error", exc.getMessage());
        }
        return data;
    }

    private static String resolveConfigServerUrl(ConfigHints hints) {
        String importValue = System.getenv("SPRING_CONFIG_IMPORT");
        if (importValue != null && importValue.contains("configserver:")) {
            int idx = importValue.indexOf("configserver:");
            String url = importValue.substring(idx + "configserver:".length()).trim();
            url = url.replaceFirst("^optional:", "");
            return url;
        }
        String uri = System.getenv("SPRING_CLOUD_CONFIG_URI");
        if (uri != null && !uri.trim().isEmpty()) {
            return uri.trim();
        }
        if (hints.configImport != null && hints.configImport.contains("configserver:")) {
            int idx = hints.configImport.indexOf("configserver:");
            String url = hints.configImport.substring(idx + "configserver:".length()).trim();
            return url.replaceFirst("^optional:", "");
        }
        if (hints.configUri != null && !hints.configUri.isEmpty()) {
            return hints.configUri;
        }
        return null;
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

    private static int parseIntArg(String value, int fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
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

    private static String firstNonEmpty(String first, String second, String fallback) {
        String value = firstNonEmpty(first, second);
        if (value != null && !value.isEmpty()) {
            return value;
        }
        return fallback;
    }

    private static ConfigHints buildConfigHints(
        Map<String, Object> classpathResources,
        Map<String, Object> fileResources,
        Map<String, Object> jarResources,
        List<String> activeProfiles
    ) {
        List<ConfigCandidate> candidates = new ArrayList<>();
        candidates.addAll(extractCandidatesFromClasspath(classpathResources));
        candidates.addAll(extractCandidatesFromFiles(fileResources));
        candidates.addAll(extractCandidatesFromJars(jarResources));

        ConfigHints hints = new ConfigHints();
        candidates.sort((a, b) -> Integer.compare(a.priority, b.priority));
        for (ConfigCandidate candidate : candidates) {
            Map<String, String> values = parseConfigValues(candidate.content, candidate.isYaml);
            if (!isCandidateApplicable(candidate, values, activeProfiles)) {
                continue;
            }
            if (hints.configImport == null) {
                hints.configImport = values.get("spring.config.import");
            }
            if (hints.configUri == null) {
                hints.configUri = values.get("spring.cloud.config.uri");
            }
            if (hints.username == null) {
                hints.username = values.get("spring.cloud.config.username");
            }
            if (hints.password == null) {
                hints.password = values.get("spring.cloud.config.password");
            }
            if (hints.encryptKey == null) {
                hints.encryptKey = values.get("encrypt.key");
            }
            if (hints.applicationName == null) {
                hints.applicationName = values.get("spring.application.name");
            }
            if (hints.profile == null) {
                hints.profile = values.get("spring.profiles.active");
            }
            if (hints.source == null && !values.isEmpty()) {
                hints.source = candidate.source;
            }
            if (hints.isComplete()) {
                break;
            }
        }
        return hints;
    }

    private static List<ConfigCandidate> extractCandidatesFromClasspath(Map<String, Object> classpathResources) {
        List<ConfigCandidate> candidates = new ArrayList<>();
        for (Map.Entry<String, Object> entry : classpathResources.entrySet()) {
            Object value = entry.getValue();
            if (!(value instanceof List)) {
                continue;
            }
            for (Object item : (List<?>) value) {
                if (!(item instanceof Map)) {
                    continue;
                }
                Map<?, ?> data = (Map<?, ?>) item;
                String name = String.valueOf(data.get("name"));
                String content = String.valueOf(data.get("content"));
                if (content.isEmpty()) {
                    continue;
                }
                candidates.add(buildCandidate(name, content, "classpath:" + name));
            }
        }
        return candidates;
    }

    private static List<ConfigCandidate> extractCandidatesFromFiles(Map<String, Object> fileResources) {
        List<ConfigCandidate> candidates = new ArrayList<>();
        Object raw = fileResources.get("matches");
        if (!(raw instanceof List)) {
            return candidates;
        }
        for (Object item : (List<?>) raw) {
            if (!(item instanceof Map)) {
                continue;
            }
            Map<?, ?> data = (Map<?, ?>) item;
            String path = String.valueOf(data.get("path"));
            String content = String.valueOf(data.get("content"));
            if (content.isEmpty()) {
                continue;
            }
            candidates.add(buildCandidate(path, content, path));
        }
        return candidates;
    }

    private static List<ConfigCandidate> extractCandidatesFromJars(Map<String, Object> jarResources) {
        List<ConfigCandidate> candidates = new ArrayList<>();
        Object raw = jarResources.get("matches");
        if (!(raw instanceof List)) {
            return candidates;
        }
        for (Object jarItem : (List<?>) raw) {
            if (!(jarItem instanceof Map)) {
                continue;
            }
            Map<?, ?> jarMap = (Map<?, ?>) jarItem;
            String jarPath = String.valueOf(jarMap.get("jarPath"));
            Object entries = jarMap.get("entries");
            if (!(entries instanceof List)) {
                continue;
            }
            for (Object entryObj : (List<?>) entries) {
                if (!(entryObj instanceof Map)) {
                    continue;
                }
                Map<?, ?> entry = (Map<?, ?>) entryObj;
                String name = String.valueOf(entry.get("name"));
                String content = String.valueOf(entry.get("content"));
                if (content.isEmpty()) {
                    continue;
                }
                candidates.add(buildCandidate(name, content, jarPath + "!" + name));
            }
        }
        return candidates;
    }

    private static ConfigCandidate buildCandidate(String name, String content, String source) {
        String lower = name.toLowerCase(Locale.ROOT);
        boolean isYaml = lower.endsWith(".yml") || lower.endsWith(".yaml");
        String profileTag = extractProfileFromFilename(lower);
        int basePriority = lower.contains("bootstrap") ? 0 : 2;
        int priority = profileTag == null ? basePriority : basePriority + 1;
        return new ConfigCandidate(priority, content, isYaml, source, profileTag);
    }

    private static Map<String, String> parseConfigValues(String content, boolean isYaml) {
        if (content == null || content.isEmpty()) {
            return Collections.emptyMap();
        }
        if (isYaml) {
            return parseYamlValues(content);
        }
        return parsePropertiesValues(content);
    }

    private static Map<String, String> parsePropertiesValues(String content) {
        Map<String, String> values = new HashMap<>();
        String[] lines = content.split("\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("!")) {
                continue;
            }
            int idx = line.indexOf('=');
            if (idx < 0) {
                idx = line.indexOf(':');
            }
            if (idx < 0) {
                continue;
            }
            String key = line.substring(0, idx).trim();
            String value = line.substring(idx + 1).trim();
            if (!key.isEmpty() && !value.isEmpty()) {
                values.put(key, stripQuotes(value));
            }
        }
        return values;
    }

    private static Map<String, String> parseYamlValues(String content) {
        Map<String, String> values = new HashMap<>();
        List<String> path = new ArrayList<>();
        String[] lines = content.split("\n");
        int[] indents = new int[0];

        for (String rawLine : lines) {
            String line = rawLine;
            int hashIndex = line.indexOf('#');
            if (hashIndex >= 0) {
                line = line.substring(0, hashIndex);
            }
            if (line.trim().isEmpty()) {
                continue;
            }
            int indent = countLeadingSpaces(line);
            String trimmed = line.trim();
            if (trimmed.startsWith("-")) {
                continue;
            }
            String[] parts = trimmed.split(":", 2);
            if (parts.length == 0) {
                continue;
            }
            String key = parts[0].trim();
            String value = parts.length > 1 ? parts[1].trim() : "";

            while (path.size() > 0 && indents[path.size() - 1] >= indent) {
                path.remove(path.size() - 1);
            }
            if (value.isEmpty()) {
                path.add(key);
                if (indents.length < path.size()) {
                    indents = Arrays.copyOf(indents, path.size());
                }
                indents[path.size() - 1] = indent;
                continue;
            }
            List<String> full = new ArrayList<>(path);
            full.add(key);
            String compound = String.join(".", full);
            values.put(compound, stripQuotes(value));
        }
        return values;
    }

    private static List<String> resolveActiveProfiles() {
        String active = firstNonEmpty(
            System.getenv("SPRING_PROFILES_ACTIVE"),
            System.getenv("SPRING_CLOUD_CONFIG_PROFILE")
        );
        if (active == null || active.trim().isEmpty()) {
            return Collections.singletonList("default");
        }
        String[] tokens = active.split("[,;]");
        List<String> profiles = new ArrayList<>();
        for (String token : tokens) {
            String trimmed = token.trim();
            if (!trimmed.isEmpty()) {
                profiles.add(trimmed);
            }
        }
        return profiles.isEmpty() ? Collections.singletonList("default") : profiles;
    }

    private static boolean isCandidateApplicable(
        ConfigCandidate candidate,
        Map<String, String> values,
        List<String> activeProfiles
    ) {
        if (candidate.profileTag != null && !activeProfiles.contains(candidate.profileTag)) {
            return false;
        }
        String docProfiles = firstNonEmpty(
            values.get("spring.profiles"),
            values.get("spring.config.activate.on-profile")
        );
        if (docProfiles == null || docProfiles.trim().isEmpty()) {
            return true;
        }
        for (String token : docProfiles.split("[,;]")) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (activeProfiles.contains(trimmed)) {
                return true;
            }
        }
        return false;
    }

    private static String extractProfileFromFilename(String name) {
        int dashIndex = name.indexOf("application-");
        if (dashIndex >= 0) {
            String remainder = name.substring(dashIndex + "application-".length());
            int dotIndex = remainder.indexOf('.');
            if (dotIndex > 0) {
                return remainder.substring(0, dotIndex);
            }
        }
        dashIndex = name.indexOf("bootstrap-");
        if (dashIndex >= 0) {
            String remainder = name.substring(dashIndex + "bootstrap-".length());
            int dotIndex = remainder.indexOf('.');
            if (dotIndex > 0) {
                return remainder.substring(0, dotIndex);
            }
        }
        return null;
    }

    private static String decryptIfPossible(String value, String encryptKey) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.startsWith("{cipher}")) {
            String cipherText = trimmed.substring("{cipher}".length());
            if (encryptKey == null || encryptKey.isEmpty()) {
                return trimmed;
            }
            try {
                TextEncryptor encryptor = Encryptors.text(encryptKey, "deadbeef");
                return encryptor.decrypt(cipherText);
            } catch (Exception exc) {
                return trimmed;
            }
        }
        if (trimmed.startsWith("ENC(") && trimmed.endsWith(")")) {
            String cipherText = trimmed.substring(4, trimmed.length() - 1);
            if (encryptKey == null || encryptKey.isEmpty()) {
                return trimmed;
            }
            try {
                TextEncryptor encryptor = Encryptors.text(encryptKey, "deadbeef");
                return encryptor.decrypt(cipherText);
            } catch (Exception exc) {
                return trimmed;
            }
        }
        return trimmed;
    }

    private static int countLeadingSpaces(String value) {
        int count = 0;
        while (count < value.length() && value.charAt(count) == ' ') {
            count += 1;
        }
        return count;
    }

    private static String stripQuotes(String value) {
        String trimmed = value.trim();
        if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
            || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static class ConfigCandidate {
        private final int priority;
        private final String content;
        private final boolean isYaml;
        private final String source;
        private final String profileTag;

        private ConfigCandidate(int priority, String content, boolean isYaml, String source, String profileTag) {
            this.priority = priority;
            this.content = content;
            this.isYaml = isYaml;
            this.source = source;
            this.profileTag = profileTag;
        }
    }

    private static class ConfigHints {
        private String configImport;
        private String configUri;
        private String username;
        private String password;
        private String encryptKey;
        private String applicationName;
        private String profile;
        private String source;

        private boolean isComplete() {
            return configImport != null
                && configUri != null
                && username != null
                && password != null
                && applicationName != null
                && profile != null;
        }
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
