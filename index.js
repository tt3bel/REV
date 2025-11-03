const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');

// تحميل الإعدادات من متغيرات البيئة (الطريقة الآمنة للاستضافة)
const config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    adminRoleId: process.env.ADMIN_ROLE_ID,
    logChannelId: process.env.LOG_CHANNEL_ID,
    serverName: process.env.SERVER_NAME,
    serverLogo: process.env.SERVER_LOGO,
    serverBanner: process.env.SERVER_BANNER,
    // acceptMessage و rejectMessage سيتم قراءتها من قاعدة البيانات
};

const dbPath = path.join(__dirname, 'database.json');

// إنشاء عميل ديسكورد
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// وظائف إدارة قاعدة البيانات
function loadDatabase() {
  try {
    const fileContent = fs.readFileSync(dbPath, 'utf8');
    const data = JSON.parse(fileContent);
    if (!Array.isArray(data.submissions)) data.submissions = [];
    if (!Array.isArray(data.tempSubmissions)) data.tempSubmissions = [];
    // التأكد من وجود إعدادات الرسائل
    if (!data.settings) {
        data.settings = {
            submissionTitle: 'نظام التقديمات',
            submissionMessage: `مرحباً بك في نظام التقديمات لسيرفر ${config.serverName || 'نا'}`
        };
    }
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initialData = { 
        submissions: [], 
        tempSubmissions: [],
        settings: {
            submissionTitle: 'نظام التقديمات',
            submissionMessage: `مرحباً بك في نظام التقديمات لسيرفر ${config.serverName || 'نا'}`
        }
      };
      fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    console.error('خطأ في تحميل قاعدة البيانات:', err);
    return { submissions: [], tempSubmissions: [], settings: { submissionTitle: 'نظام التقديمات', submissionMessage: 'مرحباً بك' } };
  }
}

function saveDatabase(data) {
  try {
    if (!Array.isArray(data.submissions)) data.submissions = [];
    if (!Array.isArray(data.tempSubmissions)) data.tempSubmissions = [];
    if (!data.settings) data.settings = { submissionTitle: 'نظام التقديمات', submissionMessage: 'مرحباً بك' };
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('خطأ في حفظ قاعدة البيانات:', err);
  }
}

// دالة إنشاء إمبد موحد
function createEmbed(title, description, color = '#bc1215', withFooter = true) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);
    
  if (config.serverLogo) {
    embed.setThumbnail(config.serverLogo);
  }
  
  if (withFooter && config.serverName) {
    embed.setFooter({ 
      text: config.serverName, 
      iconURL: config.serverLogo || undefined 
    });
  }
  
  return embed;
}

// دالة تسجيل الأحداث
async function logAction(action, details) {
  if (!config.logChannelId) return;
  
  try {
    const logChannel = await client.channels.fetch(config.logChannelId);
    if (!logChannel) return;
    
    const logEmbed = createEmbed(`📝 ${action}`, details, '#bc1215')
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('فشل في تسجيل الحدث:', err);
  }
}

// تسجيل الأوامر
const commands = [
  {
    name: 'panel',
    description: 'لوحة تحكم الأوامر (للمشرفين فقط)'
  }
];

const rest = new REST({ version: '9' }).setToken(config.token);

(async () => {
  try {
    console.log('جاري تسجيل الأوامر...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('تم تسجيل الأوامر بنجاح!');
  } catch (error) {
    console.error('حدث خطأ أثناء تسجيل الأوامر:', error);
  }
})();

// حدث تشغيل البوت
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} يعمل الآن!`);
  logAction('بدء تشغيل البوت', 'تم تشغيل البوت بنجاح');
});

// معالجة الأوامر
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, member } = interaction;
  const db = loadDatabase();
  const isAdmin = member.roles.cache.has(config.adminRoleId);

  if (commandName === 'panel') {
    if (!isAdmin) {
      const embed = createEmbed('خطأ في الصلاحية', 'هذا الأمر متاح للمشرفين فقط!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const panelEmbed = createEmbed(
      'لوحة تحكم الأوامر 🎛️',
      'اختر الأمر الذي تريد تنفيذه من الأزرار أدناه:'
    );
    
    if (config.serverLogo) {
      panelEmbed.setThumbnail(config.serverLogo);
    }

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('panel_submission')
          .setLabel('فتح التقديمات')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝'),
        new ButtonBuilder()
          .setCustomId('panel_add_section')
          .setLabel('إضافة قسم')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕')
      );

    const buttons2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('panel_remove_section')
          .setLabel('حذف قسم')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId('panel_edit_msgs')
          .setLabel('تعديل الرسائل')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️'),
        new ButtonBuilder()
          .setCustomId('panel_set_address')
          .setLabel('تعديل العنوان')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🏷️')
      );

    await interaction.reply({
      embeds: [panelEmbed],
      components: [buttons, buttons2],
      ephemeral: false
    });
    logAction('فتح لوحة التحكم', `بواسطة: <@${interaction.user.id}>`);
  }
});

// معالجة اختيار القائمة
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  
  const db = loadDatabase();

  if (interaction.customId === 'select_submission_section') {
    const selectedSectionNumber = parseInt(interaction.values[0]);
    const selectedSection = db.submissions.find(s => s.sectionNumber === selectedSectionNumber);

    if (!selectedSection) {
      const embed = createEmbed('خطأ', 'حدث خطأ في العثور على القسم المحدد!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`submission_form_${selectedSectionNumber}`)
      .setTitle(`تقديم ${selectedSection.sectionName}`);

    selectedSection.questions.forEach((question, index) => {
      const questionInput = new TextInputBuilder()
        .setCustomId(`answer_${index}`)
        .setLabel(question)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(index === 0);

      const actionRow = new ActionRowBuilder().addComponents(questionInput);
      modal.addComponents(actionRow);
    });

    await interaction.showModal(modal);
    logAction('فتح نموذج التقديم', `القسم: ${selectedSection.sectionName}\nبواسطة: <@${interaction.user.id}>`);
  }

  if (interaction.customId === 'select_submission_form_part') {
    const selectedPart = interaction.values[0];
    
    if (selectedPart === 'basic_info') {
      const modal = new ModalBuilder()
        .setCustomId('add_submission_section_basic')
        .setTitle('المعلومات الأساسية للقسم');
      
      const inputs = [
        new TextInputBuilder().setCustomId('section_name').setLabel("اسم القسم").setStyle(TextInputStyle.Short).setRequired(true),
        new TextInputBuilder().setCustomId('admin_id').setLabel("ايدي مسؤول القبول").setStyle(TextInputStyle.Short).setRequired(true),
        new TextInputBuilder().setCustomId('channel_id').setLabel("ايدي روم التقديمات").setStyle(TextInputStyle.Short).setRequired(true),
        new TextInputBuilder().setCustomId('section_number').setLabel("رقم القسم (فريد لكل قسم)").setStyle(TextInputStyle.Short).setRequired(true)
      ];
      
      const actionRows = inputs.map(input => new ActionRowBuilder().addComponents(input));
      modal.addComponents(...actionRows);
      await interaction.showModal(modal);
    }
    else if (selectedPart === 'additional_info') {
      const db = loadDatabase();
      if (!db.tempSubmissions || db.tempSubmissions.length === 0) {
        const embed = createEmbed('خطأ', 'يجب إكمال المعلومات الأساسية أولاً!', '#bc1215');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('add_submission_section_additional')
        .setTitle('المعلومات الإضافية للقسم');
      
      const inputs = [
        new TextInputBuilder().setCustomId('questions').setLabel("الأسئلة (سؤال لكل سطر)").setStyle(TextInputStyle.Paragraph).setRequired(true),
        new TextInputBuilder().setCustomId('section_emoji').setLabel("إيموجي القسم (اختياري)").setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('accept_message').setLabel("رسالة القبول (اختياري)").setStyle(TextInputStyle.Paragraph).setRequired(false),
        new TextInputBuilder().setCustomId('reject_message').setLabel("رسالة الرفض (اختياري)").setStyle(TextInputStyle.Paragraph).setRequired(false)
      ];
      
      const actionRows = inputs.map(input => new ActionRowBuilder().addComponents(input));
      modal.addComponents(...actionRows);
      await interaction.showModal(modal);
    }
  }

  if (interaction.customId === 'select_section_for_edit') {
    const sectionNumber = interaction.values[0];
    
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`edit_accept_${sectionNumber}`).setLabel('تعديل رسالة القبول').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`edit_reject_${sectionNumber}`).setLabel('تعديل رسالة الرفض').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ 
      embeds: [createEmbed('تعديل الرسائل', 'اختر نوع الرسالة التي تريد تعديلها:')],
      components: [buttons] 
    });
  }

  if (interaction.customId === 'remove_section_select') {
    const sectionNumber = parseInt(interaction.values[0]);
    const section = db.submissions.find(s => s.sectionNumber === sectionNumber);
    
    if (!section) {
      const embed = createEmbed('خطأ', 'القسم غير موجود!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    db.submissions = db.submissions.filter(s => s.sectionNumber !== sectionNumber);
    saveDatabase(db);
    
    const embed = createEmbed('نجاح', `✅ تم حذف قسم "${section.sectionName}" بنجاح!`, '#bc1215');
    await interaction.reply({ embeds: [embed], ephemeral: true });
    logAction('حذف قسم', `القسم: ${section.sectionName}\nبواسطة: <@${interaction.user.id}>`);
  }
});

// معالجة الأزرار
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  const db = loadDatabase();
  const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);

  if (interaction.customId.startsWith('panel_')) {
    if (!isAdmin) {
      const embed = createEmbed('خطأ في الصلاحية', 'هذا الأمر متاح للمشرفين فقط!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const action = interaction.customId.replace('panel_', '');

    switch (action) {
      case 'submission':
        if (!db.submissions || db.submissions.length === 0) {
          const embed = createEmbed('نظام التقديمات', 'لا توجد أقسام تقديم متاحة حالياً.', '#bc1215');
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embedSubmission = createEmbed(
          db.settings.submissionTitle,
          db.settings.submissionMessage
        );
        
        if (config.serverBanner) {
          embedSubmission.setImage(config.serverBanner);
        }

        const optionsSubmission = db.submissions.map(section => ({
          label: section.sectionName,
          value: section.sectionNumber.toString(),
          emoji: section.emoji || undefined
        }));

        const selectMenuSubmission = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_submission_section')
            .setPlaceholder('اختر قسم التقديم')
            .addOptions(optionsSubmission)
        );

        await interaction.reply({ 
          embeds: [embedSubmission], 
          components: [selectMenuSubmission], 
          ephemeral: false 
        });
        break;

      case 'add_section':
        const selectMenuAdd = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_submission_form_part')
            .setPlaceholder('اختر جزء النموذج لإكمال البيانات')
            .addOptions([
              { label: 'المعلومات الأساسية', value: 'basic_info' },
              { label: 'المعلومات الإضافية', value: 'additional_info' }
            ])
        );
        await interaction.reply({
          content: 'اختر جزء النموذج لبدء إضافة القسم الجديد:',
          components: [selectMenuAdd],
          ephemeral: true
        });
        break;

      case 'remove_section':
        if (!db.submissions || db.submissions.length === 0) {
          const embed = createEmbed('خطأ', 'لا توجد أقسام متاحة للحذف!', '#ff0000');
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const removeSelect = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('remove_section_select')
            .setPlaceholder('اختر القسم للحذف')
            .addOptions(db.submissions.map(section => ({
              label: section.sectionName,
              value: section.sectionNumber.toString(),
              emoji: section.emoji || '❓'
            })))
        );

        await interaction.reply({
          embeds: [createEmbed('حذف قسم', 'اختر القسم الذي تريد حذفه:')],
          components: [removeSelect],
          ephemeral: true
        });
        break;

      case 'edit_msgs':
        if (!db.submissions || db.submissions.length === 0) {
          const embed = createEmbed('خطأ', 'لا توجد أقسام تقديم متاحة.', '#bc1215');
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        const editSelectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_section_for_edit')
            .setPlaceholder('اختر القسم')
            .addOptions(
              db.submissions.map(section => ({
                label: section.sectionName,
                value: section.sectionNumber.toString(),
                emoji: section.emoji || '<:tickets:1433448437377925172>'
              }))
            )
        );
        await interaction.reply({ 
          embeds: [createEmbed('تعديل الرسائل', 'اختر القسم الذي تريد تعديل رسائله:')],
          components: [editSelectMenu], 
          ephemeral: true
        });
        break;
        
      case 'set_address':
        const addressModal = new ModalBuilder()
          .setCustomId('set_submission_address')
          .setTitle('تعديل رسالة النظام');

        const titleInput = new TextInputBuilder()
          .setCustomId('submission_title')
          .setLabel("عنوان النظام")
          .setStyle(TextInputStyle.Short)
          .setValue(db.settings.submissionTitle)
          .setRequired(true);

        const messageInput = new TextInputBuilder()
          .setCustomId('submission_message')
          .setLabel("رسالة الترحيب")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(db.settings.submissionMessage)
          .setRequired(true);

        addressModal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(messageInput)
        );
        await interaction.showModal(addressModal);
        break;
    }
  }

  if (interaction.customId.startsWith('edit_accept_') || interaction.customId.startsWith('edit_reject_')) {
    const isAccept = interaction.customId.startsWith('edit_accept_');
    const sectionNumber = interaction.customId.split('_')[2];
    
    const section = db.submissions.find(s => s.sectionNumber == sectionNumber);
    if (!section) {
      const embed = createEmbed('خطأ', 'القسم غير موجود!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`${isAccept ? 'save_accept' : 'save_reject'}_${sectionNumber}`)
      .setTitle(`تعديل رسالة ${isAccept ? 'القبول' : 'الرفض'}`);

    const messageInput = new TextInputBuilder()
      .setCustomId('new_message')
      .setLabel(`رسالة ${isAccept ? 'القبول' : 'الرفض'} الجديدة`)
      .setStyle(TextInputStyle.Paragraph)
      .setValue(isAccept ? (section.acceptMessage || '') : (section.rejectMessage || ''))
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
    await interaction.showModal(modal);
    logAction('System Logs - فتح تعديل الرسائل', `القسم: ${section.sectionName}\nنوع الرسالة: ${isAccept ? 'قبول' : 'رفض'}\nبواسطة: <@${interaction.user.id}>`);
  }

  if (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_')) {
    try {
      const isAccept = interaction.customId.startsWith('accept_');
      const [_, sectionNumber, userId] = interaction.customId.split('_');
      
      const section = db.submissions.find(s => s.sectionNumber == sectionNumber);
      if (!section) {
        const embed = createEmbed('خطأ', 'القسم غير موجود!', '#bc1215');
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      if (interaction.user.id !== section.adminId && !interaction.member.roles.cache.has(config.adminRoleId)) {
        const embed = createEmbed('خطأ في الصلاحية', 'ليس لديك صلاحية للرد على هذا التقديم!', '#bc1215');
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        const embed = createEmbed('خطأ', 'لا يمكن العثور على المستخدم!', '#bc1215');
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (isAccept) {
        const responseEmbed = new EmbedBuilder()
          .setColor('#bc1215')
          .setTitle('Subbmission Accepted - تم قبول تقديمك')
          .setDescription(`لديك 24 ساعة لفتح تذكرة وإكمال الإجراءات\n\nhttps://discord.com/channels/1366616890625232948/1424034016969101363\n\n**الوقت المتبقي لفتح تذكرة:**`)
          .setTimestamp();

        await user.send({ embeds: [responseEmbed] }).catch(() => console.log('لا يمكن إرسال رسالة خاصة للمستخدم'));
        
        const statusEmbed = createEmbed('تم القبول', `**القسم:** ${section.sectionName}\n**بواسطة:** <@${interaction.user.id}>`, '#00ff00');
        await interaction.message.edit({ components: [], embeds: [interaction.message.embeds[0], statusEmbed] });

        const confirmEmbed = createEmbed('تمت العملية', 'تم قبول التقديم بنجاح!', '#bc1215');
        await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
        logAction('System Logs - قبول تقديم', `القسم: ${section.sectionName}\nالمستخدم: <@${userId}>\nبواسطة: <@${interaction.user.id}>`);

      } else {
        const modal = new ModalBuilder()
          .setCustomId(`reject_reason_${sectionNumber}_${userId}`)
          .setTitle('سبب الرفض');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('اكتب سبب الرفض هنا')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
      }

    } catch (error) {
      console.error('حدث خطأ في معالجة القبول/الرفض:', error);
      const errorEmbed = createEmbed('خطأ غير متوقع', 'حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقاً.', '#bc1215');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});

// معالجة إرسال النماذج
client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;

  const db = loadDatabase();
  
  if (interaction.customId.startsWith('submission_form_')) {
    const sectionNumber = parseInt(interaction.customId.replace('submission_form_', ''));
    const section = db.submissions.find(s => s.sectionNumber === sectionNumber);

    if (!section) {
      const embed = createEmbed('خطأ', 'حدث خطأ في العثور على القسم المحدد!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const answers = [];
    for (let i = 0; i < section.questions.length; i++) {
      answers.push(interaction.fields.getTextInputValue(`answer_${i}`) || 'لم يتم الإجابة');
    }

    const embed = createEmbed(` ${section.sectionName}`, ` - <@${interaction.user.id}>`)
      .setColor('#bc1215')
      .setFooter({ text: `ID: ${interaction.user.id}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    section.questions.forEach((question, index) => {
      embed.addFields({ name: question, value: answers[index] });
    });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${sectionNumber}_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${sectionNumber}_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const channel = await client.channels.fetch(section.channelId).catch(() => null);
    if (!channel) {
      const embed = createEmbed('خطأ', 'حدث خطأ في إرسال التقديم!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await channel.send({ 
      content: `<@${section.adminId}> - <@${interaction.user.id}> `,
      embeds: [embed],
      components: [buttons]
    });

    const successEmbed = createEmbed(' ', '', '#bc1215');
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    logAction('System Logs - تقديم جديد', `القسم: ${section.sectionName}\nالمستخدم: <@${interaction.user.id}>`);
  }

  if (interaction.customId.startsWith('reject_reason_')) {
    const [_, __, sectionNumber, userId] = interaction.customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason');
    
    const section = db.submissions.find(s => s.sectionNumber == sectionNumber);
    if (!section) {
      const embed = createEmbed('خطأ', 'القسم غير موجود!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
      const embed = createEmbed('خطأ', 'لا يمكن العثور على المستخدم!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const responseEmbed = new EmbedBuilder()
      .setColor('#bc1215')
      .setTitle('Subbmission Rejected - تم رفض تقديمك')
      .setDescription(`**سبب الرفض:**\n${reason}`)
      .setTimestamp();

    await user.send({ embeds: [responseEmbed] }).catch(() => console.log('لا يمكن إرسال رسالة خاصة للمستخدم'));

    const statusEmbed = createEmbed('تم الرفض', `**القسم:** ${section.sectionName}\n**بواسطة:** <@${interaction.user.id}>`, '#ff0000');
    await interaction.message.edit({ components: [], embeds: [interaction.message.embeds[0], statusEmbed] });

    const confirmEmbed = createEmbed('تمت العملية', 'تم رفض التقديم بنجاح!', '#bc1215');
    await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

    logAction('System Logs -رفض تقديم', `**القسم:** ${section.sectionName}\n**المستخدم:** <@${userId}>\n**السبب:** ${reason}\n**بواسطة:** <@${interaction.user.id}>`);
  }
  
  if (interaction.customId === 'add_submission_section_basic') {
    const basicData = {
      sectionName: interaction.fields.getTextInputValue('section_name'),
      adminId: interaction.fields.getTextInputValue('admin_id'),
      channelId: interaction.fields.getTextInputValue('channel_id'),
      sectionNumber: parseInt(interaction.fields.getTextInputValue('section_number')),
      tempId: Date.now()
    };
    
    if (isNaN(basicData.sectionNumber)) {
      const embed = createEmbed('خطأ', 'يجب أن يكون رقم القسم رقمًا صحيحًا!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (!db.submissions) db.submissions = [];
    if (db.submissions.some(s => s.sectionNumber === basicData.sectionNumber)) {
      const embed = createEmbed('خطأ', 'رقم القسم هذا مستخدم بالفعل!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (!db.tempSubmissions) db.tempSubmissions = [];
    db.tempSubmissions.push(basicData);
    saveDatabase(db);
    
    const embed = createEmbed('تم حفظ المعلومات الأساسية', 'الرجاء إكمال المعلومات الإضافية للقسم', '#bc1215');
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (interaction.customId === 'add_submission_section_additional') {
    const additionalData = {
      questions: interaction.fields.getTextInputValue('questions').split('\n').filter(q => q.trim()),
      emoji: interaction.fields.getTextInputValue('section_emoji') || null,
      acceptMessage: interaction.fields.getTextInputValue('accept_message') || null,
      rejectMessage: interaction.fields.getTextInputValue('reject_message') || null
    };
    
    if (!db.tempSubmissions || db.tempSubmissions.length === 0) {
      const embed = createEmbed('خطأ', 'لم يتم العثور على البيانات الأساسية!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const basicData = db.tempSubmissions.pop();
    const newSection = { ...basicData, ...additionalData };
    delete newSection.tempId;
    
    if (!db.submissions) db.submissions = [];
    db.submissions.push(newSection);
    saveDatabase(db);
    
    const embed = createEmbed('نجاح', `✅ تم إضافة قسم التقديم "${newSection.sectionName}" بنجاح!`, '#bc1215');
    await interaction.reply({ embeds: [embed], ephemeral: true });
    logAction('إضافة قسم جديد', `القسم: ${newSection.sectionName}\nبواسطة: <@${interaction.user.id}>`);
  }

  if (interaction.customId === 'set_submission_address') {
    db.settings.submissionTitle = interaction.fields.getTextInputValue('submission_title');
    db.settings.submissionMessage = interaction.fields.getTextInputValue('submission_message');
    saveDatabase(db);
    
    const embed = createEmbed('نجاح', '✅ تم تحديث رسالة النظام بنجاح!', '#bc1215');
    await interaction.reply({ embeds: [embed], ephemeral: true });
    logAction('تعديل عنوان النظام', `بواسطة: <@${interaction.user.id}>`);
  }

  if (interaction.customId.startsWith('save_accept_') || interaction.customId.startsWith('save_reject_')) {
    const isAccept = interaction.customId.startsWith('save_accept_');
    const sectionNumber = parseInt(interaction.customId.split('_')[2]);
    const newMessage = interaction.fields.getTextInputValue('new_message');

    const sectionIndex = db.submissions.findIndex(s => s.sectionNumber === sectionNumber);
    if (sectionIndex === -1) {
      const embed = createEmbed('خطأ', 'القسم غير موجود!', '#bc1215');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (isAccept) {
      db.submissions[sectionIndex].acceptMessage = newMessage;
    } else {
      db.submissions[sectionIndex].rejectMessage = newMessage;
    }

    saveDatabase(db);

    const embed = createEmbed('نجاح', `✅ تم تحديث رسالة ${isAccept ? 'القبول' : 'الرفض'} بنجاح!`, '#bc1215');
    await interaction.reply({ embeds: [embed], ephemeral: true });
    logAction(`تعديل رسالة ${isAccept ? 'القبول' : 'الرفض'}`, `القسم: ${db.submissions[sectionIndex].sectionName}\nبواسطة: <@${interaction.user.id}>`);
  }
});

// تسجيل الدخول
client.login(config.token).catch(err => {
  console.error('فشل في تسجيل الدخول:', err);
  process.exit(1);
});