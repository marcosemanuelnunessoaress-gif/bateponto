require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  Events
} = require('discord.js');

const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  ROLE_STAFF_ID,
  CANAL_BATEPONTO_ID,
  CANAL_LOGS_ID
} = process.env;

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'bateponto.json');
const messageCountsFile = path.join(dataDir, 'messageCounts.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] });

const mainColor = '#8B0000';
const footerText = 'Rivex • Sistema de Bate-Ponto';

async function ensureDataFile() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(dataFile);
      const raw = await fs.readFile(dataFile, 'utf8');
      if (!raw.trim()) {
        await fs.writeFile(dataFile, '[]', 'utf8');
      } else {
        try {
          JSON.parse(raw);
        } catch (error) {
          await fs.writeFile(dataFile, '[]', 'utf8');
        }
      }
    } catch {
      await fs.writeFile(dataFile, '[]', 'utf8');
    }

    try {
      await fs.access(messageCountsFile);
      const rawCounts = await fs.readFile(messageCountsFile, 'utf8');
      if (!rawCounts.trim()) {
        await fs.writeFile(messageCountsFile, '{}', 'utf8');
      } else {
        try {
          JSON.parse(rawCounts);
        } catch (error) {
          await fs.writeFile(messageCountsFile, '{}', 'utf8');
        }
      }
    } catch {
      await fs.writeFile(messageCountsFile, '{}', 'utf8');
    }
  } catch (error) {
    console.error('Erro ao preparar o arquivo de dados:', error);
    process.exit(1);
  }
}

async function readData() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('Erro lendo dados de ponto:', error);
    return [];
  }
}

async function readMessageCounts() {
  try {
    const raw = await fs.readFile(messageCountsFile, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('Erro lendo contagem de mensagens:', error);
    return {};
  }
}

async function writeMessageCounts(counts) {
  try {
    await fs.writeFile(messageCountsFile, JSON.stringify(counts, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro salvando contagem de mensagens:', error);
  }
}

async function writeData(data) {
  try {
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro salvando dados de ponto:', error);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function buildBaseEmbed() {
  return new EmbedBuilder().setColor(mainColor).setFooter({ text: footerText }).setTimestamp();
}

function buildPainelEmbed() {
  return buildBaseEmbed()
    .setTitle('Sistema de Bate-Ponto Rivex')
    .setDescription('Gerencie seus pontos de forma fácil e rápida. Use os botões abaixo para iniciar ou terminar seu ponto, ver informações ou conferir o ranking.')
    .setFields(
      { name: '🧾 Como usar', value: 'Use os botões para gerenciar seus pontos. Apenas staff ou administradores podem iniciar e terminar ponto.', inline: false }
    );
}

function buildActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('iniciar').setLabel('🟢 Iniciar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('terminar').setLabel('🔴 Terminar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('info').setLabel('📊 Informações').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ranking').setLabel('🏆 Ranking').setStyle(ButtonStyle.Secondary)
  );
}

function buildRankingPaginationRow(currentPage, totalPages) {
  const row = new ActionRowBuilder();
  if (currentPage > 0) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ranking_prev_${currentPage}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary)
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId('dummy').setLabel(`Página ${currentPage + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
  if (currentPage < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ranking_next_${currentPage}`).setLabel('⏩').setStyle(ButtonStyle.Secondary)
    );
  }
  return row;
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function isStaff(member) {
  return member.roles.cache.has(ROLE_STAFF_ID) || isAdmin(member);
}

async function replyError(interaction, message) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
  }
  return interaction.reply({ content: `❌ ${message}`, ephemeral: true });
}

async function logPontoFinalizado(client, record) {
  try {
    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(CANAL_LOGS_ID);
    if (!channel) return;

    const embed = buildBaseEmbed()
      .setTitle('📝 Ponto Finalizado')
      .setDescription(`O ponto do staff foi finalizado com sucesso.`)
      .addFields(
        { name: 'Staff', value: `<@${record.userId}>`, inline: false },
        { name: 'Início', value: `<t:${Math.floor(record.startTime / 1000)}:F>`, inline: true },
        { name: 'Fim', value: `<t:${Math.floor(record.endTime / 1000)}:F>`, inline: true },
        { name: 'Duração', value: formatDuration(record.durationMs), inline: false }
      );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao enviar log de ponto finalizado:', error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);
  await ensureDataFile();
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const member = message.member;
    if (!member) return;

    const counts = await readMessageCounts();
    const authorId = message.author.id;
    counts[authorId] = (counts[authorId] || 0) + 1;
    await writeMessageCounts(counts);

    const content = message.content.trim().toLowerCase();

    if (content === 'rx!painel') {
      if (!isAdmin(member)) {
        return message.reply({ content: '❌ Apenas administradores podem usar este comando.' });
      }

      return  message.channel.send({
  components: [buildActionRow()]
});
    }

    if (content === 'rx!resetbateponto') {
      if (!isAdmin(member)) {
        return message.reply({ content: '❌ Apenas administradores podem usar este comando.' });
      }

      await writeData([]);
      await writeMessageCounts({});
      return message.reply('✅ Todos os registros de bate-ponto e contagem de mensagens foram resetados com sucesso.');
    }
  } catch (error) {
    console.error('Erro ao processar comando de mensagem:', error);
    message.reply({ content: '❌ Ocorreu um erro ao processar o comando.' });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'dummy') {
    return interaction.reply({ content: '📄 Use os botões para navegar pelas páginas.', ephemeral: true });
  }

  try {
    const member = interaction.member;
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    if (!guildId || !member) {
      return replyError(interaction, 'Interação inválida.');
    }

    if (!isStaff(member)) {
      return replyError(interaction, 'Você precisa ser staff ou administrador para usar este botão.');
    }

    if (channelId !== CANAL_BATEPONTO_ID) {
      return replyError(interaction, 'Este botão só funciona no canal de bate-ponto.');
    }

    const data = await readData();
    const userId = interaction.user.id;
    const username = interaction.user.tag;

    if (interaction.customId === 'iniciar') {
      const openPoint = data.find((item) => item.userId === userId && item.status === 'aberto');
      if (openPoint) {
        return replyError(interaction, 'Você já tem um ponto aberto. Finalize-o antes de iniciar outro.');
      }

      if (!member.voice || !member.voice.channel) {
        return replyError(interaction, 'Você precisa estar em uma chamada de voz para iniciar o ponto.');
      }

      const record = {
        userId,
        username,
        guildId,
        startTime: Date.now(),
        endTime: null,
        durationMs: 0,
        status: 'aberto'
      };
      data.push(record);
      await writeData(data);
      return interaction.reply({ content: '✅ Seu ponto foi iniciado com sucesso!', ephemeral: true });
    }

    if (interaction.customId === 'terminar') {
      const openPoint = data.find((item) => item.userId === userId && item.status === 'aberto');
      if (!openPoint) {
        return replyError(interaction, 'Nenhum ponto aberto encontrado para finalizar.');
      }

      openPoint.endTime = Date.now();
      openPoint.durationMs = openPoint.endTime - openPoint.startTime;
      openPoint.status = 'fechado';
      await writeData(data);

      await interaction.reply({ content: `🔴 Ponto finalizado! Tempo total: ${formatDuration(openPoint.durationMs)}`, ephemeral: true });
      await logPontoFinalizado(client, openPoint);
      return;
    }

    if (interaction.customId === 'info') {
      const openPoint = data.find((item) => item.userId === userId && item.status === 'aberto');
      const closedPoints = data.filter((item) => item.userId === userId && item.status === 'fechado');
      const totalAccumulated = closedPoints.reduce((sum, item) => sum + (item.durationMs || 0), 0);
      const messageCounts = await readMessageCounts();

const messages =
    messageCounts[userId] || 0;

const callPoints =
    Math.floor(
        totalAccumulated /
        (30 * 60 * 1000)
    );

const messagePoints =
    Math.floor(messages / 10) * 5;

const totalPoints =
    callPoints + messagePoints;
      const currentDuration = openPoint ? Date.now() - openPoint.startTime : 0;

      const embed = buildBaseEmbed()
        .setTitle('📊 Informações de Ponto')
        .setDescription(`Resumo do seu ponto atual e histórico acumulado.`)
        .addFields(
          { name: 'Ponto aberto', value: openPoint ? 'Sim' : 'Não', inline: true },
          { name: 'Pontos fechados', value: `${closedPoints.length}`, inline: true },
          { name: 'Total acumulado', value: formatDuration(totalAccumulated), inline: false },
          { name: '<:1_:1474075862654783732> Mensagens', value: `${messages}`, inline: true },
          { name: '<:1_:1474075851032105111> Pontos de Call', value: `${callPoints}`, inline: true },
          { name: '<:dred_infodlx:1474076124731670812> Pontuação Total', value: `${totalPoints}`, inline: true }
        );

      if (openPoint) {
        embed.addFields(
          { name: 'Início atual', value: `<t:${Math.floor(openPoint.startTime / 1000)}:F>`, inline: false },
          { name: 'Tempo no ponto', value: formatDuration(currentDuration), inline: false }
        );
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'ranking') {
      const closedPoints = data.filter((item) => item.status === 'fechado');
      const messageCounts = await readMessageCounts();
      const totals = closedPoints.reduce((map, item) => {
        const previous = map.get(item.userId) || { username: item.username, durationMs: 0 };
        previous.durationMs += item.durationMs || 0;
        map.set(item.userId, previous);
        return map;
      }, new Map());

      if (totals.size === 0) {
        const embed = buildBaseEmbed().setTitle('🏆 Ranking de Staff').setDescription('Ainda não há pontos fechados para gerar o ranking.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

     const fullRanking = Array.from(totals.entries())
.map(([id, value]) => {

    const messages = messageCounts[id] || 0;

    const callPoints = Math.floor(
        value.durationMs / (30 * 60 * 1000)
    );

    const messagePoints = Math.floor(
        messages / 10
    ) * 5;

    const totalPoints = callPoints + messagePoints;

    return {
        userId: id,
        username: value.username,
        durationMs: value.durationMs,
        messages,
        callPoints,
        messagePoints,
        totalPoints
    };
})
.sort((a, b) => b.totalPoints - a.totalPoints);

      const page = 0;
      const itemsPerPage = 10;
      const totalPages = Math.ceil(fullRanking.length / itemsPerPage);
      const startIdx = page * itemsPerPage;
      const ranking = fullRanking.slice(startIdx, startIdx + itemsPerPage);

      const lines = ranking.map((item, index) => {

    const globalPosition = startIdx + index + 1;

    const position =
        globalPosition === 1 ? '<:SallerZendGold:1485819967952650270> 1º' :
        globalPosition === 2 ? '<:SilverZendSaller:1485819966816256000> 2º' :
        globalPosition === 3 ? '<:BronzeZendSaller:1485819965473816696> 3º' :
        `${globalPosition}º`;

    return (
`${position} • ${item.username}

<:ticketsrivex:1485344295341789205>Tempo em Call: ${formatDuration(item.durationMs)}
<:1_:1474075851032105111> Call: ${item.callPoints}
<:1_:1474075862654783732> Mensagens: ${item.messagePoints}
<:dred_infodlx:1474076124731670812> Total: ${item.totalPoints}`
    );

});

      const embed = buildBaseEmbed()
    .setTitle('<:1_:1474075867323043872> Ranking de Pontos Rivex')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${fullRanking.length} pessoas` });

      const row = buildRankingPaginationRow(page, totalPages);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('ranking_next_')) {
      const currentPage = parseInt(interaction.customId.split('_')[2]);
      const closedPoints = data.filter((item) => item.status === 'fechado');
      const messageCounts = await readMessageCounts();
      const totals = closedPoints.reduce((map, item) => {
        const previous = map.get(item.userId) || { username: item.username, durationMs: 0 };
        previous.durationMs += item.durationMs || 0;
        map.set(item.userId, previous);
        return map;
      }, new Map());

      const fullRanking = Array.from(totals.entries())
        .map(([id, value]) => ({ userId: id, username: value.username, durationMs: value.durationMs, messages: messageCounts[id] || 0 }))
        .sort((a, b) => b.durationMs - a.durationMs);

      const page = currentPage + 1;
      const itemsPerPage = 10;
      const totalPages = Math.ceil(fullRanking.length / itemsPerPage);
      const startIdx = page * itemsPerPage;
      const ranking = fullRanking.slice(startIdx, startIdx + itemsPerPage);

   const lines = ranking.map((item, index) => {

    const globalPosition = startIdx + index + 1;

    const position =
        globalPosition === 1 ? '<:SallerZendGold:1485819967952650270> 1º' :
        globalPosition === 2 ? '<:SilverZendSaller:1485819966816256000> 2º' :
        globalPosition === 3 ? '<:BronzeZendSaller:1485819965473816696> 3º' :
        `${globalPosition}º`;

    return (
`${position} • ${item.username}

<:ticketsrivex:1485344295341789205>Tempo em Call: ${formatDuration(item.durationMs)}
<:1_:1474075851032105111> Call: ${item.callPoints}
<:1_:1474075862654783732> Mensagens: ${item.messagePoints}
<:dred_infodlx:1474076124731670812> Total: ${item.totalPoints}`
    );

});

      const embed = buildBaseEmbed()
   .setTitle('<:1_:1474075867323043872> Ranking de Pontos Rivex')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${fullRanking.length} pessoas` });

      const row = buildRankingPaginationRow(page, totalPages);
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }

    if (interaction.customId.startsWith('ranking_prev_')) {
      const currentPage = parseInt(interaction.customId.split('_')[2]);
      const closedPoints = data.filter((item) => item.status === 'fechado');
      const messageCounts = await readMessageCounts();
      const totals = closedPoints.reduce((map, item) => {
        const previous = map.get(item.userId) || { username: item.username, durationMs: 0 };
        previous.durationMs += item.durationMs || 0;
        map.set(item.userId, previous);
        return map;
      }, new Map());

      const fullRanking = Array.from(totals.entries())
        .map(([id, value]) => ({ userId: id, username: value.username, durationMs: value.durationMs, messages: messageCounts[id] || 0 }))
        .sort((a, b) => b.durationMs - a.durationMs);

      const page = currentPage - 1;
      const itemsPerPage = 10;
      const totalPages = Math.ceil(fullRanking.length / itemsPerPage);
      const startIdx = page * itemsPerPage;
      const ranking = fullRanking.slice(startIdx, startIdx + itemsPerPage);

     const lines = ranking.map((item, index) => {

    const globalPosition = startIdx + index + 1;

    const position =
        globalPosition === 1 ? '<:SallerZendGold:1485819967952650270> 1º' :
        globalPosition === 2 ? '<:SilverZendSaller:1485819966816256000> 2º' :
        globalPosition === 3 ? '<:BronzeZendSaller:1485819965473816696> 3º' :
        `${globalPosition}º`;

    return (
`${position} • ${item.username}

<:ticketsrivex:1485344295341789205>Tempo em Call: ${formatDuration(item.durationMs)}
<:1_:1474075851032105111> Call: ${item.callPoints}
<:1_:1474075862654783732> Mensagens: ${item.messagePoints}
<:dred_infodlx:1474076124731670812> Total: ${item.totalPoints}`
    );

});

      const embed = buildBaseEmbed()
        .setTitle('<:1_:1474075867323043872> Ranking de Pontos Rivex')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${fullRanking.length} pessoas` });

      const row = buildRankingPaginationRow(page, totalPages);
      await interaction.update({ embeds: [embed], components: [row] });
      return;
    }

    return replyError(interaction, 'Botão desconhecido.');
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    return replyError(interaction, 'Ocorreu um erro ao processar sua ação.');
  }
});

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !ROLE_STAFF_ID || !CANAL_BATEPONTO_ID || !CANAL_LOGS_ID) {
  console.error('Por favor, preencha todas as variáveis no arquivo .env.');
  process.exit(1);
}

client.login(TOKEN).catch((error) => {
  console.error('Erro ao conectar o bot:', error);
  process.exit(1);
});
