package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"guess-who/server-go/internal/api"
	"guess-who/server-go/internal/db"
	"guess-who/server-go/internal/socket"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	socketio "github.com/zishang520/socket.io/servers/socket/v3"
	"github.com/zishang520/socket.io/v3/pkg/types"
)

func main() {
	if _, err := db.Init(""); err != nil {
		log.Fatalf("failed to init database: %v", err)
	}
	defer db.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	api.RegisterGameRoutes(r)
	api.RegisterStatic(r)

	opts := socketio.DefaultServerOptions()
	opts.SetPath("/socket.io")
	opts.SetPingTimeout(60 * time.Second)
	opts.SetPingInterval(25 * time.Second)
	opts.SetConnectTimeout(20 * time.Second)
	opts.SetCors(&types.Cors{Origin: "*"})

	io := socketio.NewServer(nil, opts)
	socket.RegisterRoomHandlers(io)

	socketHandler := io.ServeHandler(nil)
	r.Handle("/socket.io/*", socketHandler)
	r.Handle("/socket.io", socketHandler)

	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}
	addr := host + ":" + port

	server := &http.Server{Addr: addr, Handler: r}

	log.Printf("Go backend listening on %s", addr)
	log.Printf("Socket.io ready at /socket.io")
	if host == "127.0.0.1" {
		log.Println("→ Dev: open http://localhost:5173 (Vite proxies /api and /socket.io here)")
	} else {
		log.Println("→ Production: serving API + static + socket.io on", addr)
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
