# spring-config-agent

Java agent that captures configuration inputs for Spring workloads by dumping
system properties, environment variables, and classpath/config files.

Build:
```
mvn -q -f spring-config-agent/pom.xml package
```

Usage (attach to a JVM):
```
jcmd <pid> VM.load_agent spring-config-agent/target/spring-config-agent-0.1.0.jar output=/tmp/spring-config.json
```

Usage (run directly for inspection):
```
java -jar spring-config-agent/target/spring-config-agent-0.1.0.jar output=/tmp/spring-config.json
```

Arguments:
- `output`: file path to write JSON (defaults to stdout)
- `maxChars`: maximum characters captured per file/resource (default 200000)
- `maxFiles`: max config files captured during filesystem scan (default 120)
- `maxJars`: max jars inspected during jar scan (default 20)
- `maxDepth`: max directory depth when scanning files/jars (default 6)
- `searchPaths`: extra semicolon/comma-separated paths to scan

Notes:
- Profile filtering uses `SPRING_PROFILES_ACTIVE` / `SPRING_CLOUD_CONFIG_PROFILE` or `default`.
- Config server auth supports Basic and will try to decrypt `{cipher}` / `ENC(...)` values
  using `encrypt.key` from config files or `ENCRYPT_KEY` env.
