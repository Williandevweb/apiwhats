const { Client,LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult, check } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 8009;  //####### Colocar a proxima porta 8006 8007 etc
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const fs = require('fs');
const mysql = require('mysql2/promise');
const { stringify } = require('querystring');
const dirQrCode = './qrcode';

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
		database: 'alavanca_WSystem'   
	});
}

//## Configuração VPS
// const createConnection = async () => {
// 	return await mysql.createConnection({
// 		host: 'localhost',
// 		user: 'alavanca_wsystem',
// 		password: 'y53X6Y8pk^wX',
// 		database: 'alavanca_wsystem'   
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

const getContatos = async (celular) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM whats_app_contatos WHERE whats_app_contatos.celular = ?', [celular]);
  delay(1000).then(async function() {
		 connection.end();
		delay(500).then(async function() {
			 connection.destroy();
		});
	});
	if (rows.length > 0) {
      return rows;
  }else{
	  return "false";
  }
}

const postContatos = async (celular, nome, data, tipoSaudacaoAusencia) => {
	const connection = await createConnection();
  var rows = [];
  if(tipoSaudacaoAusencia == 'saudacao'){
    rows = await connection.execute('INSERT INTO `whats_app_contatos` (`id`,`nome`, `celular`, `data_saudacao`, `data_ausencia`) VALUES (NULL,?,?,?,null)', [nome,celular,data]);                             
  }
  else{
    rows = await connection.execute('INSERT INTO `whats_app_contatos` (`id`,`nome`, `celular`, `data_saudacao`, `data_ausencia`) VALUES (NULL,?,?,null,?)', [nome,celular,data]);
  }
  delay(1000).then(async function() {
  connection.end();
  delay(500).then(async function() {
    connection.destroy();
  });
 });
 if (rows.length > 0) { 
  return "true";
 }
 return "false";
}

const putContatos = async (celular, dataUpdate, tipoSaudacaoAusencia) => {
	const connection = await createConnection();
  var rows = [];

  if(tipoSaudacaoAusencia == 'saudacao'){
    rows = await connection.execute('UPDATE whats_app_contatos SET data_saudacao = NOW() WHERE celular = ?;', [dataUpdate, celular]);   
  }else{
    rows = await connection.execute('UPDATE whats_app_contatos SET data_ausencia = NOW() WHERE celular = ?;', [dataUpdate, celular]);   
  }                          
  delay(1000).then(async function() {
    connection.end();
   delay(500).then(async function() {
      connection.destroy();
   });
 });
 if (rows.length > 0) {
  return "true";
 }
  return "false";
}

const getMensagens = async () => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM whats_app_mensagens');
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

const getHorarioFunc = async (diaSemana) => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM funcionamento_deliveries WHERE dia = ?', [diaSemana]);
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

const getSaudacaoAusencia = async () => {
	const connection = await createConnection();
	const [rows] = await connection.execute('SELECT * FROM whats_app_saudacao_ausencias');
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

const criarSessao = function(id, token,ativo) {
  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
    // CAMINHO DO CHROME PARA WINDOWS (REMOVER O COMENTÁRIO ABAIXO)
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    //===================================================================================
    // CAMINHO DO CHROME PARA MAC (REMOVER O COMENTÁRIO ABAIXO)
    //executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    //===================================================================================
    // CAMINHO DO CHROME PARA LINUX (REMOVER O COMENTÁRIO ABAIXO)
    // executablePath: '/usr/bin/google-chrome-stable',
    //===================================================================================
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
    io.emit('qr',{id: id, src:"imgs/check.svg"});
    try {
      fs.unlinkSync(dirQrCode + '/' + id + '/qrcode.png');
    } catch(e){
      console.log(e);
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

    async function getDiaSemana(){
      var dataAtual = new Date();
      var diaDaSemana = dataAtual.getDay();
      var nomeDia = "";

      switch (diaDaSemana) {
        case 0:
          nomeDia = "DOMINGO";
          break;
        case 1:
          nomeDia = "SEGUNDA"
          break;
        case 2:
          nomeDia = "TERÇA";
          break;
        case 3:
          nomeDia = "QUARTA";
          break;
        case 4:
          nomeDia = "QUINTA";
          break;
        case 5:
          nomeDia = "SEXTA";
          break;
        case 6:
          nomeDia = "SABADO";
          break;
      }

      return nomeDia;
    }

    async function formataHoraAtual(){

      var dataAtual = new Date();
      var horaAtual = dataAtual.getHours();
      var minutoAtual = dataAtual.getMinutes();
      var horaAtualAux = "";

      if(horaAtual < 10){
          horaAtualAux = "0" + horaAtual + ":" + minutoAtual;
      }else{
          horaAtualAux = horaAtual + ":" + minutoAtual;
      }
      return horaAtualAux;
    }

    async function validaFuncionamentoAbertoFechado(horaAtual, inicioExpediente,fimExpediente){
       if (horaAtual >= inicioExpediente && horaAtual < fimExpediente){
        return "Aberto";
      }else{
        return "Fechado";
      }   
    }

    async function validaPeriodicidade(periodicidadeSaudacao,periodicidadeAusencia){
      if(periodicidadeSaudacao < 0){
        periodicidadeSaudacao = 0;
      }

      if(periodicidadeAusencia < 0){
        periodicidadeAusencia = 0;
      }
    }

    async function buscaMensagensDelivery(){
      var mensagens = await getMensagens();
      var mensUnica = "";

      if(mensagens != "false"){
        mensagens.forEach(function (pergResp){            
          if(msg.body.toLocaleLowerCase().includes(pergResp.pergunta.toLocaleLowerCase())){

            mensUnica = pergResp.resposta;              
          }        
        });         
      }
      return mensUnica;
    }

    async function getMensResposta (validaFuncionamento, periodicidadeSaudacao,periodicidadeAusencia, mensSaudacao, mensAusencia){
      
      var data_saudacao = new Date();
      var data_ausencia = new Date();
      const celular = msg.from.replace(/\D/g, '');    
      const nome = msg._data.notifyName;        

      var result = await getContatos(celular);
      if(result != "false"){
        if(result[0].data_saudacao != null){
          data_saudacao = new Date(result[0].data_saudacao);
        }
        if(result[0].data_ausencia != null){            
          data_ausencia = new Date(result[0].data_ausencia);
        }        
      }
         
      const dataSaudacaoAusencia = new Date();          
      const diferencaEmMilissegundosSaudacao = dataSaudacaoAusencia - data_saudacao;
      const diferencaEmMilissegundosAusencia = dataSaudacaoAusencia - data_ausencia;    
      const diferencaEmDiasSaudacao = Math.floor(diferencaEmMilissegundosSaudacao / (1000 * 60 * 60 * 24));
      const diferencaEmDiasAusencia = Math.floor(diferencaEmMilissegundosAusencia / (1000 * 60 * 60 * 24));
      var mensUnica = "";
      var ctrlMensAusencia = false;

      validaPeriodicidade(periodicidadeSaudacao,periodicidadeAusencia);

      switch (validaFuncionamento) {
        case 'Aberto':          
          if(result == "false"){
            client.sendMessage(msg.from, mensSaudacao);
            await postContatos(celular,nome, dataSaudacaoAusencia, 'saudacao');
          }else{
            if(result[0].data_saudacao == null){
              client.sendMessage(msg.from, mensSaudacao);
              await putContatos(celular, dataSaudacaoAusencia, 'saudacao');
            }else{
              if(periodicidadeSaudacao <= 0){
                client.sendMessage(msg.from, mensSaudacao);
                await putContatos(celular, dataSaudacaoAusencia, 'saudacao');
              }else{
                if(periodicidadeSaudacao <= diferencaEmDiasSaudacao){
                  client.sendMessage(msg.from, mensSaudacao);
                  await putContatos(celular, dataSaudacaoAusencia, 'saudacao');
                }
              }    
            }        
          }
          break;
        case 'Fechado':
          ctrlMensAusencia = true;
          result = await getContatos(celular);
          if(result == "false"){
            client.sendMessage(msg.from, mensAusencia);
            await postContatos(celular,nome, dataSaudacaoAusencia, 'ausencia');
          }else{
            if(result[0].data_ausencia == null){
              client.sendMessage(msg.from, mensAusencia);
              await putContatos(celular, dataSaudacaoAusencia, 'ausencia');
            }else{
              if(periodicidadeAusencia <= 0){
                client.sendMessage(msg.from, mensAusencia);
                await putContatos(celular, dataSaudacaoAusencia, 'ausencia');
              }else{
                if(periodicidadeAusencia <= diferencaEmDiasAusencia){
                  client.sendMessage(msg.from, mensAusencia);
                  await putContatos(celular, dataSaudacaoAusencia, 'ausencia');
                }
              }            
            }
          }
          break;                 
      }  

      if(!ctrlMensAusencia){
        mensUnica = await buscaMensagensDelivery();
      }

      if(mensUnica != ""){
        client.sendMessage(msg.from, mensUnica);
      }      
    }

    async function msgRetorno(){
      var diaDaSemana = await getDiaSemana();
      var funcionamento_deliveries = await getHorarioFunc(diaDaSemana);     
      var inicioExpediente = funcionamento_deliveries[0].inicio_expediente;
      var fimExpediente = funcionamento_deliveries[0].fim_expediente;
      var horaAtual = await formataHoraAtual();
      var mensSaudacaoAusencia = await getSaudacaoAusencia(); 
      var periodicidadeSaudacao = mensSaudacaoAusencia[0].periodicidadeSaudacao;
      var mensSaudacao = mensSaudacaoAusencia[0].saudacao;
      var periodicidadeAusencia = mensSaudacaoAusencia[0].periodicidadeAusencia;
      var mensAusencia = mensSaudacaoAusencia[0].ausencia;
      var validaFuncionamento = await validaFuncionamentoAbertoFechado(horaAtual,inicioExpediente,fimExpediente);      
      await getMensResposta(validaFuncionamento, periodicidadeSaudacao, periodicidadeAusencia, mensSaudacao, mensAusencia);
    }
    if (msg.body !== null && !msg.from.includes('@g.us') && msg.type.toLocaleLowerCase() !== "ciphertext" && msg.type.toLocaleLowerCase() !== "e2e_notification" && msg.type.toLocaleLowerCase() !== ""){
      msgRetorno();         
    }
});

  client.on('auth_failure', function() {
    io.emit('message', { id: id, text: 'Falha na autenticação, reiniciando...' });
  });

  client.on('disconnected', (reason) => {
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

app.post('/statusPedidos', [
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
