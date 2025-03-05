document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const socket = new WebSocket("ws://10.0.0.132:7777"); // Change the server address

    let drawing = false;

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mousemove", draw);

    function startDrawing(e) {
        drawing = true;
        draw(e);
    }

    function stopDrawing() {
        drawing = false;
        ctx.beginPath();
        sendDrawingData();
    }

    function draw(e) {
        if (!drawing) return;

        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#000";

        ctx.lineTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);

        sendDrawingData();
    }

    function sendDrawingData() {
        const imageData = canvas.toDataURL("image/png");
        socket.send(JSON.stringify({ type: "draw", data: imageData }));
    }

    socket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "draw") {
            const image = new Image();
            image.onload = function () {
                ctx.drawImage(image, 0, 0);
            };
            image.src = data.data;
        }
    });
});
