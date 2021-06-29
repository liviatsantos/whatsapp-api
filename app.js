const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { numeroTelefoneFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const porta = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ 
    extended: true 
}));
app.use(fileUpload({
    debug: true
}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
    res.sendFile('index.html', { 
        root: __dirname 
    });
});

const client = new Client({ 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
          ],
     }, 
     session: sessionCfg 
    });

client.initialize();

//chatbot
client.on('message', msg => {
    if (msg.body == '!ping') {
      msg.reply('pong');
    }
});

// socket io
io.on('connection', function(socket){
    socket.emit('message', 'Conectando...');
    
    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url)=> {
            socket.emit('qr', url);
            socket.emit('message', 'QR code recebido. Escaneie por favor!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp está pronto!');
        socket.emit('message', 'Whatsapp está pronto!');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Autenticado!');
        socket.emit('message', 'Autenticado!');
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });
});

//envia mensagem
app.post('/envia-mensagem', [
    
    body('numero').notEmpty(),
    body('mensagem').notEmpty(),

], (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
        return msg
    });
    if( !errors.isEmpty()){
        return res.status(422).json({
            status: false,
            message: errors.mapped()
        })
    }

    const numero = numeroTelefoneFormatter(req.body.numero);
    const mensagem = req.body.mensagem;

    client.sendMessage(numero, mensagem).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
        }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

//envia imagem
app.post('/envia-imagem', (req, res) => {
    
    const numero = numeroTelefoneFormatter(req.body.numero);
    const legenda = req.body.legenda;
    const imagem = MessageMedia.fromFilePath('./imagem.png');

    client.sendMessage(numero, imagem, { caption: legenda }).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
        }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

//envia arquivo
app.post('/envia-arquivo', (req, res) => {
    
    const numero = numeroTelefoneFormatter(req.body.numero);
    const legenda = req.body.legenda;
    const file = req.files.arquivo;
    const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name)

    client.sendMessage(numero, media, { caption: legenda }).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
        }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});


server.listen(porta, function(){
    console.log('App rodando na porta *: ' + porta);
});
