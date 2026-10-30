FROM eclipse-temurin:26-jdk AS build
WORKDIR /workspace
COPY backend/mvnw backend/mvnw
COPY backend/.mvn backend/.mvn
COPY document-worker document-worker
RUN --mount=type=cache,target=/root/.m2 bash backend/mvnw -B -ntp -f document-worker/pom.xml -DskipTests package

FROM eclipse-temurin:26-jre
WORKDIR /app
COPY --from=build /workspace/document-worker/target/godeck-document-worker-0.0.1-SNAPSHOT.jar /app/worker.jar
USER 10001:10001
ENTRYPOINT ["java", "-Xmx128m", "-XX:MaxMetaspaceSize=96m", "-XX:ActiveProcessorCount=1", "-XX:+ExitOnOutOfMemoryError", "-Djava.awt.headless=true", "-jar", "/app/worker.jar"]
