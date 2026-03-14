package com.example.demo;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final FileUploadHandler fileUploadHandler;

    public WebSocketConfig(FileUploadHandler fileUploadHandler) {
        this.fileUploadHandler = fileUploadHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(fileUploadHandler, "/ws/upload")
                .setAllowedOrigins("*"); // Open for all origins for testing frontend
    }
}
