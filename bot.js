const { Client,LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult, check } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 8005;  //####### Colocar a proxima porta 8006 8007 etc
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const fs = require('fs');
const mysql = require('mysql2/promise');
const { stringify } = require('querystring');
const dirQrCode = './qrcode';
var nomeContato = "";
var cod_estabel = 1;  //#######Colocar aqui o código da empresa do cliente

function delay(t, v) {
  return new Promise(function(resolve) { 
      setTimeout(resolve.bind(null, v), t)
  });
}

//##Configuração Local
const createConnection = async () => {
	return await mysql.createConnection({
		host: 'localhost',
		user: 'root',
		password: '',
		database: 'whats'   
	});
}

//## Configuração VPS
// const createConnection = async () => {
// 	return await mysql.createConnection({
// 		host: 'localhost',
// 		user: 'portalalavan5JwT',
// 		password: 'qRX2JaQpFVy57G8b1W9zfHAL',
// 		database: 'portal_alavancaweb_com_br_anJUWDKO'   
// 	});
// }

if (!fs.existsSync(dirQrCode)){
  fs.mkdirSync(dirQrCode)
}

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.use(fileUpload({
  debug: false
}));

app.get('/', (req, res) => {
  res.send('Conectado');
});

const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

const criarArquivoSessaoSeNaoExistir = function() {

  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
    } catch(err) {
      console.log('Falha ao criar arquivo: ', err);
    }
  }
}

criarArquivoSessaoSeNaoExistir();

const setarArquivoSessao = function(sessions) {  
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

const deletarArquivoSessao = function(sessions) { 
  const set = carregarArquivoSessao();
  var pegaId = "";
  set.forEach(function(data){
    if(data.id == sessions.id){
      pegaId =  data.id 
      set.splice(pegaId, 1);                 
    }
    fs.writeFile(SESSIONS_FILE, JSON.stringify(set), function(err) {
      if (err) {
        console.log(err);
      }
    });    
  });
}

const carregarArquivoSessao = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));  
}

const savedSessions = carregarArquivoSessao();
const sessionIndex = savedSessions.findIndex(sess => sess.id);
const tok = savedSessions.splice(sessionIndex, 1)[0];

const getUser = async (msgfom) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM clientes_whats WHERE celular = ?', [msgfom]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
      return rows[0].data_interacao;
  }
	return "false";
}

const getPeriod = async (cod_estabel) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM saudacoes WHERE cod_estabel = ?', [cod_estabel]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
    const saudacaoPeriodicidade = [rows[0].periodicidade, rows[0].saudacao];
      return saudacaoPeriodicidade;
  }
	return "false";
}

const getMens = async (cod_estabel) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM mensagens WHERE cod_estabel = ?', [cod_estabel]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
      return rows;
  }
	return "false";
}

const getHorarioFunc = async (cod_estabel, diaSemana) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM ' + diaSemana + ' WHERE cod_estabel = ?', [cod_estabel]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
      return rows;
  }
	return "false";
}

const getAusencia = async (cod_estabel) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM ausencias WHERE cod_estabel = ?', [cod_estabel]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
      return rows[0].ausencia;
  }
	return "false";
}

const setUser = async (msgfom, nome, data, cod_estabel) => {
	const connection = await createConnection();
  const [rows] = await connection.execute('INSERT INTO `clientes_whats` (`id`,`nome`, `celular`, `data_interacao`, `cod_estabel`) VALUES (NULL,?,?,?,?)', [nome,msgfom,data,cod_estabel]);                             
  delay(1000).then(async function() {
    connection.end();
   delay(500).then(async function() {
      connection.destroy();
   });
 });
 if (rows.length > 0) return true;

 return false;
}

const updateDateUser = async (msgfom, data) => {
	const connection = await createConnection();
  const [rows] = await connection.execute('UPDATE clientes_whats SET data_interacao = ? WHERE clientes_whats.celular = ?;', [data, msgfom]);                             
  delay(1000).then(async function() {
    connection.end();
   delay(500).then(async function() {
      connection.destroy();
   });
 });
 if (rows.length > 0) return "true";

 return "false";
}

const criarSessao = function(id, token,ativo) {
  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      //executablePath: '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
    },
    authStrategy: new LocalAuth({
      clientId: id
    })
  });  

  client.initialize();

  if (!fs.existsSync(dirQrCode + '/' + id)){
    fs.mkdirSync(dirQrCode + '/' + id)
  }

  client.on('qr', async (qr) => {

    const bufferImage = await qrcode.toDataURL(qr);
    var base64Data = bufferImage.replace(/^data:image\/png;base64,/, "");
    try {

      fs.unlinkSync(dirQrCode + '/' + id + '/qrcode.png');
    } catch(e){
    } finally {
      fs.writeFileSync(dirQrCode + '/' + id + '/qrcode.png', base64Data, 'base64');
    }
    qrcode.toDataURL(qr, (err, url) => {
      io.emit('qr', { id: id, src: url });
      io.emit('message', { id: id, text: 'QRCode recebido, aponte a câmera  seu celular!' });
    });
  });

  client.on('ready', async () => {
    io.emit('qr',{id: id, src:"img/check.svg"});
    try {
      fs.unlinkSync(dirQrCode + '/' + id + '/qrcode.png');
    } catch(e){
    }

    const savedSessions = carregarArquivoSessao();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    savedSessions[sessionIndex].ativo = 1;
    setarArquivoSessao(savedSessions);

  });

  client.on('authenticated', () => {
    io.emit('authenticated', { id: id });
    io.emit('qr', './check.svg');
    io.emit('message', { id: id, text: 'Dispositivo autenticado!' });
  });

  client.on('message', async(msg) => {
    
    async function salvaContato(dados){
      try{

        nomeContato = msg._data.notifyName;        
        const user = msg.from.replace(/\D/g, '');  
        const getUserFrom = await getUser(user);    
        const mensagemSaudacao = await getPeriod(cod_estabel);        
    
        const data_interacao = function dataAtualFormatada(){
          var data = new Date(),
              dia  = data.getDate().toString(),
              diaF = (dia.length == 1) ? '0'+dia : dia,
              mes  = (data.getMonth()+1).toString(), //+1 pois no getMonth Janeiro começa com zero.
              mesF = (mes.length == 1) ? '0'+mes : mes,
              anoF = data.getFullYear();
          return anoF+"/"+mesF+"/"+diaF;
        } 

        if (getUserFrom === "false") { 
          const data = new Date();  
          await setUser(user, nomeContato, data, cod_estabel);
          
          if(dados == 1){
            if (msg.body !== ""){
              client.sendMessage(msg.from, mensagemSaudacao[1]);
            }
          }      
        }else{   
              
          var day1 = new Date(getUserFrom);         
          var day2 = new Date(data_interacao());

          var difference= Math.abs(day2-day1);
          var days = difference/(1000 * 3600 * 24)

          if(Math.trunc(days) >= mensagemSaudacao[0]){

            if(dados == 1){ 
              client.sendMessage(msg.from, mensagemSaudacao[1]);
            }

            await updateDateUser(user, new Date());
          }else{          
              if(Math.trunc(days) !== 0){
                await updateDateUser(user, new Date());
              }          
          }        
        } 
      }
      catch(e){
        console.log('Não foi possível armazenar o usuário' + e)
      }    
    }

    async function buscaMensagens(){
      const mensagens = await getMens(cod_estabel);

      if(mensagens !== "false"){
        mensagens.forEach(function (mensagens){
          if(mensagens.status !== 'Inativo'){
            if(msg.body.toLocaleLowerCase().includes(mensagens.pergunta.toLocaleLowerCase())){
              client.sendMessage(msg.from, mensagens.resposta);
            }
          }
        });
      }
    }

    async function horarioFunc(){
      var dataAtual = new Date();
      var diaDaSemana = dataAtual.getDay();
      var nomeDia = "";

      switch (diaDaSemana) {
        case 0:
          nomeDia = "domingos";
          break;
        case 1:
          nomeDia = "segundas"
          break;
        case 2:
          nomeDia = "tercas";
          break;
        case 3:
          nomeDia = "quartas";
          break;
        case 4:
          nomeDia = "quintas";
          break;
        case 5:
          nomeDia = "sextas";
          break;
        case 6:
          nomeDia = "sabados";
          break;
      }

      const hrsFunc = await getHorarioFunc(cod_estabel, nomeDia);

      const date = new Date();
      const horaAtual = date.getHours();
      var  atual = "";

      if(horaAtual < 10){
             atual = "0" + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
      }else{
             atual = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
      }
      const inicioAtendimento = hrsFunc[0].inicio;
      const paradaAtendimento = hrsFunc[0].pausa;
      const retornoAtendimento = hrsFunc[0].retorno;
      const fimAtendimento = hrsFunc[0].fim;
      const mensAusencia = await getAusencia(cod_estabel); 
      
      if(mensAusencia == 'false'){
        mensAusencia = '';
      }

      if (atual.substring(0,5) >= inicioAtendimento && atual.substring(0,5) < paradaAtendimento || (atual.substring(0,5) >= retornoAtendimento && atual.substring(0,5) < fimAtendimento)){
          salvaContato(1); //1- retorna mensagem saudação 2- retorna mensagem estabelecimento fechado 
          buscaMensagens();
      }else{
        salvaContato(2); 
        client.sendMessage(msg.from, mensAusencia);
      }     
    }

    if (msg.body !== null && !msg.from.includes('@g.us') && msg.type.toLocaleLowerCase() !== "ciphertext" && msg.type.toLocaleLowerCase() !== "e2e_notification" && msg.type.toLocaleLowerCase() !== ""){
      
      horarioFunc();
      
    }
});

  client.on('auth_failure', function() {
    io.emit('message', { id: id, text: 'Falha na autenticação, reiniciando...' });
  });

  client.on('disconnected', (reason) => {

    io.emit('message', { id: id, text: 'Dispositivo desconectado!' });
    client.destroy();
    client.initialize();

    const savedSessions = carregarArquivoSessao();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setarArquivoSessao(savedSessions);

    io.emit('remove-session', id);
  });

  sessions.push({
    id: id,
    token: token,
    ativo: ativo,
    client: client
  });

  const savedSessions = carregarArquivoSessao();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      token: token,
      ready: false,
      ativo: ativo,
    });
    setarArquivoSessao(savedSessions);
  }
}

const init = function(socket) {

  const savedSessions = carregarArquivoSessao();

  if (savedSessions.length > 0) {
    if (socket) {
      savedSessions.forEach((e, i, arr) => {
        arr[i].ready = false;
      });

      socket.emit('init', savedSessions);
    } else {
      savedSessions.forEach(sess => {
        criarSessao(sess.id, sess.token, sess.ativo);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {
  init(socket);

  socket.on('create-session', function(data) {
    data.id = data.id.replace(/\s/g, '')
    criarSessao(data.id, data.token, data.ativo);
  });

  socket.on('destroy-session', async function(id) {
    try{
      deletarArquivoSessao(id);
    }catch(error) {
      console.log("Oppsss Erro inesperados!")
    }         
  });
});

// POST send-message
app.post('/chamado', [
  body('user').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const sender = req.body.sender.replace(/\s/g, '');
  const foundSession = sessions.find(sess => sess.id === sender);
  const client = foundSession ? foundSession.client : undefined;
  if (!client) {
    return res.status(422).json({
      status: false,
      message: `Sender: ${sender} não foi encontrado!`
    })
  }

  const token = req.body.token;
  const savedSessions = carregarArquivoSessao();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == sender);
  const tokenN = savedSessions.splice(sessionIndex, 1)[0].token;

  if(tokenN !== token){
    res.status(422).json({
      status: false,
      message: 'Token inválido'
    })
    return;
  }

  const user = req.body.user + '@c.us';
  const message = req.body.message;

    client.sendMessage(user, message).then(response => {
    res.status(200).json({
      status: true,
      message: 'Mensagem enviada',
      response: response
    });
    }).catch(err => {
    res.status(500).json({
      status: false,
      message: 'Mensagem não enviada',
      response: err.text
    });
    });
});

server.listen(port, function() {
  console.log('Aplicação rodando na porta *: ' + port);
});
