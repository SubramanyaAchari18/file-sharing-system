package com.example.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class FileUploadHandler extends AbstractWebSocketHandler {

    private final Path uploadDir = Paths.get("uploads");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, FileUploadContext> sessionContextMap = new ConcurrentHashMap<>();

    public FileUploadHandler() {
        try {
            if (!Files.exists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload directory", e);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode payload = objectMapper.readTree(message.getPayload());
        if (payload.has("type") && "metadata".equals(payload.get("type").asText())) {
            String filename = payload.get("filename").asText();
            long size = payload.get("size").asLong();

            // Sanitize filename mapping
            String safeFilename = System.currentTimeMillis() + "_" + filename.replaceAll("[^a-zA-Z0-9\\.\\-]", "_");
            Path filePath = uploadDir.resolve(safeFilename);
            
            FileChannel fileChannel = FileChannel.open(filePath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            sessionContextMap.put(session.getId(), new FileUploadContext(fileChannel, size, safeFilename));
            
            // Send ack back to client
            session.sendMessage(new TextMessage("{\"type\":\"ack\", \"status\": \"ready\"}"));
        } else if (payload.has("type") && "complete".equals(payload.get("type").asText())) {
             FileUploadContext context = sessionContextMap.remove(session.getId());
             if (context != null) {
                 context.fileChannel.close();
                 session.sendMessage(new TextMessage("{\"type\":\"complete_ack\", \"filename\": \"" + context.filename + "\"}"));
             }
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        FileUploadContext context = sessionContextMap.get(session.getId());
        if (context == null) {
            System.err.println("No context for session " + session.getId());
            return;
        }

        ByteBuffer payload = message.getPayload();
        int bytesWritten = context.fileChannel.write(payload);
        context.bytesReceived += bytesWritten;

        // Send progress update natively as chunk writes successfully complete
        double progress = (double) context.bytesReceived / context.totalSize * 100;
        String progressMsg = String.format("{\"type\":\"progress\", \"written\": %d, \"progress\": %.2f}", context.bytesReceived, progress);
        session.sendMessage(new TextMessage(progressMsg));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        FileUploadContext context = sessionContextMap.remove(session.getId());
        if (context != null) {
            context.fileChannel.close();
        }
    }

    private static class FileUploadContext {
        FileChannel fileChannel;
        long totalSize;
        long bytesReceived;
        String filename;

        public FileUploadContext(FileChannel fileChannel, long totalSize, String filename) {
            this.fileChannel = fileChannel;
            this.totalSize = totalSize;
            this.bytesReceived = 0;
            this.filename = filename;
        }
    }
}
