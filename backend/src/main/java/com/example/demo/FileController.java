package com.example.demo;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/files")
@CrossOrigin(origins = "*") // Allow requests from our React app
public class FileController {

    private final Path uploadDir = Paths.get("uploads");

    @GetMapping
    public List<FileInfo> getFiles() throws IOException {
        if (!Files.exists(uploadDir)) {
            return List.of();
        }
        try (Stream<Path> stream = Files.list(uploadDir)) {
            return stream.map(path -> new FileInfo(
                    path.getFileName().toString(),
                    path.toFile().length()
            )).collect(Collectors.toList());
        }
    }

    @GetMapping("/download/{filename:.+}")
    public ResponseEntity<Resource> downloadFile(@PathVariable String filename) {
        try {
            Path file = uploadDir.resolve(filename);
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() || resource.isReadable()) {
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + resource.getFilename() + "\"")
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (MalformedURLException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    public static class FileInfo {
        private String filename;
        private long size;

        public FileInfo(String filename, long size) {
            this.filename = filename;
            this.size = size;
        }

        public String getFilename() { return filename; }
        public void setFilename(String filename) { this.filename = filename; }
        public long getSize() { return size; }
        public void setSize(long size) { this.size = size; }
    }
}
