const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const db = require('./db');

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir o front-end diretamente pela mesma porta do back-end
const frontendDir = path.join(__dirname, '..', 'plataforma-animal-frontend');
app.use(express.static(frontendDir));

// ==========================================
// ROTAS PARA USUÁRIOS
// ==========================================
app.post('/usuarios', async (req, res) => {
    const { nome, email, senha_hash, provedor_autenticacao, telefone } = req.body;

    if (!nome || !email || !senha_hash) {
        return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        const query = `
            INSERT INTO usuarios (nome, email, senha_hash, provedor_autenticacao, telefone) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await db.query(query, [
            nome, 
            email, 
            senha_hash, 
            provedor_autenticacao || null, 
            telefone || null
        ]);
        res.status(201).json({ mensagem: 'Usuário criado com sucesso!', id: resultado.insertId });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao criar usuário', detalhes: error.message });
    }
});

// ==========================================
// ROTAS PARA ANIMAIS (OCORRÊNCIAS VGI)
// ==========================================

// [GET] Listar animais
app.get('/animais', async (req, res) => {
    try {
        const { status, especie, porte, busca } = req.query;
        let query = 'SELECT * FROM animais WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (especie) {
            query += ' AND especie = ?';
            params.push(especie);
        }
        if (porte) {
            query += ' AND porte = ?';
            params.push(porte);
        }
        if (busca) {
            query += ' AND (nome_identificador LIKE ? OR descricao LIKE ?)';
            params.push(`%${busca}%`, `%${busca}%`);
        }

        query += ' ORDER BY data_registro DESC';

        const [animais] = await db.query(query, params);
        res.json(animais);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao listar animais', detalhes: error.message });
    }
});

// [POST] Registrar ocorrência com foto persistida no banco
app.post('/animais', async (req, res) => {
    try {
        const { 
            nome_identificador, 
            especie, 
            porte, 
            status, 
            latitude, 
            longitude, 
            descricao,
            foto_base64,
            usuarios_id_usuario 
        } = req.body;

        if (!especie || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ 
                erro: 'Campos obrigatórios ausentes: especie, latitude e longitude.' 
            });
        }

        const query = `INSERT INTO animais 
            (nome_identificador, especie, porte, status, latitude, longitude, descricao, foto_url, usuarios_id_usuario) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const statusInicial = status || 'Perdido';
        const usuarioId = usuarios_id_usuario ? Number(usuarios_id_usuario) : null;
        const fotoSalva = (foto_base64 && foto_base64.startsWith('data:image/')) ? foto_base64 : null;

        const [resultado] = await db.query(query, [
            nome_identificador || 'Não identificado',
            especie,
            porte || 'Médio',
            statusInicial,
            parseFloat(latitude),
            parseFloat(longitude),
            descricao || '',
            fotoSalva,
            usuarioId
        ]);

        res.status(201).json({ 
            mensagem: 'Ocorrência registrada com sucesso!', 
            id: resultado.insertId,
            status: statusInicial
        });
    } catch (error) {
        console.error('Erro ao registrar animal:', error);
        res.status(500).json({ erro: 'Erro ao registrar animal', detalhes: error.message });
    }
});

// [PUT] Atualizar status de curadoria
app.put('/animais/:id', async (req, res) => {
    const { id } = req.params;
    const { status, nome_identificador, porte, descricao } = req.body;

    try {
        const [existente] = await db.query('SELECT * FROM animais WHERE id_animal = ?', [id]);
        
        if (existente.length === 0) {
            return res.status(404).json({ erro: 'Registro de animal não encontrado.' });
        }

        const atual = existente[0];

        const query = `
            UPDATE animais 
            SET status = ?, nome_identificador = ?, porte = ?, descricao = ?
            WHERE id_animal = ?
        `;

        const novoStatus = status || atual.status;

        await db.query(query, [
            novoStatus,
            nome_identificador || atual.nome_identificador,
            porte || atual.porte,
            descricao !== undefined ? descricao : atual.descricao,
            id
        ]);

        res.json({ 
            mensagem: 'Ocorrência atualizada com sucesso!', 
            id: Number(id), 
            status: novoStatus 
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar animal', detalhes: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}...`);
});