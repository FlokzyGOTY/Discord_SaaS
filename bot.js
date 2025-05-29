const { Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require("discord.js")
const fetch = require('node-fetch');
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

client.once("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`)
  const commands = [
    new SlashCommandBuilder()
      .setName("feedback")
      .setDescription("Gib Feedback zu einer Bestellung ab")
  ];
  try {
    await client.application.commands.set(commands)
    console.log("Slash commands registered")
  } catch (error) {
    console.error("Error registering commands:", error)
  }
})

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand() && interaction.commandName === "feedback") {
    // 1. Hole Orders für den User
    await interaction.deferReply({ ephemeral: true });
    let orders = [];
    try {
      const res = await fetch(`${process.env.BASE_URL}/api/orders?userId=${interaction.user.id}`);
      orders = await res.json();
    } catch (e) {
      return interaction.editReply({ content: 'Fehler beim Laden deiner Bestellungen.' });
    }
    if (!Array.isArray(orders) || orders.length === 0) {
      return interaction.editReply({ content: 'Du hast keine Bestellungen.' });
    }
    // 2. Baue SelectMenu
    const options = orders.slice(0, 25).map(order => ({
      label: order.productId?.name ? `${order.productId.name} (${order._id.slice(-6)})` : order._id,
      value: order._id
    }));
    const select = new StringSelectMenuBuilder()
      .setCustomId('feedback_order_select')
      .setPlaceholder('Wähle eine Bestellung aus')
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(select);
    await interaction.editReply({ content: 'Wähle die Bestellung, für die du Feedback geben möchtest:', components: [row] });
  }

  // 3. Handle SelectMenu-Auswahl
  if (interaction.isStringSelectMenu() && interaction.customId === 'feedback_order_select') {
    const orderId = interaction.values[0];
    // Zeige Modal für Sterne/Kommentar
    const modal = new ModalBuilder()
      .setCustomId(`feedback_modal_${orderId}`)
      .setTitle('Feedback abgeben');
    const sterneInput = new TextInputBuilder()
      .setCustomId('sterne')
      .setLabel('Sternebewertung (1-5)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(1)
      .setPlaceholder('1-5')
      .setRequired(true);
    const kommentarInput = new TextInputBuilder()
      .setCustomId('kommentar')
      .setLabel('Kommentar (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    modal.addComponents(
      new ActionRowBuilder().addComponents(sterneInput),
      new ActionRowBuilder().addComponents(kommentarInput)
    );
    await interaction.showModal(modal);
  }

  // 4. Handle Modal Submit
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('feedback_modal_')) {
    const orderId = interaction.customId.replace('feedback_modal_', '');
    const sterne = parseInt(interaction.fields.getTextInputValue('sterne'));
    const kommentar = interaction.fields.getTextInputValue('kommentar') || '';
    if (isNaN(sterne) || sterne < 1 || sterne > 5) {
      return interaction.reply({ content: 'Bitte gib eine gültige Sternebewertung (1-5) ein.', ephemeral: true });
    }
    try {
      const res = await fetch(`${process.env.BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, sterne, kommentar, userId: interaction.user.id })
      });
      if (res.ok) {
        await interaction.reply({ content: `Danke für dein Feedback! (${sterne} Sterne)`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Fehler beim Senden des Feedbacks.`, ephemeral: true });
      }
    } catch (e) {
      await interaction.reply({ content: `Fehler beim Senden des Feedbacks.`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN)

module.exports = client;
