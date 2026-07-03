# 💰 Plano de Monetização - Aura Video Downloader

## 1. Modelos de Cobrança (Opções)

### A. Modelo por Créditos (Recomendado ⭐)
**Como funciona**:
- Usuário compra créditos mensais
- Cada download consome créditos baseado em:
  - Duração do vídeo (ex: 5 créditos/hora)
  - Resolução (480p = 1x, 1080p = 2x, 4K = 4x)
  - Total: Duração × Multiplicador de Resolução

**Exemplo**:
- Plano Free: 0 créditos (sem downloads)
- Plano Basic: 100 créditos/mês = ~10 vídeos 1080p (1h)
- Plano Pro: 500 créditos/mês = ~50 vídeos 1080p
- Plano Premium: 2000 créditos/mês = ~200 vídeos 1080p
- Créditos extras: $0.99 = 50 créditos

**Vantagens**:
✅ Flexível e previsível
✅ Penaliza uso pesado (4K)
✅ Incentiva planos maiores
✅ Fácil controlar custos de servidor

**Desvantagens**:
❌ Mais complexo para o usuário entender

---

### B. Modelo por Downloads (Simples)
**Como funciona**:
- Limite de downloads por mês
- Sem importar duração ou resolução

**Exemplo**:
- Free: 3 downloads/mês
- Basic: 50 downloads/mês = $4.99/mês
- Pro: 200 downloads/mês = $9.99/mês
- Premium: Ilimitado = $19.99/mês

**Vantagens**:
✅ Super simples
✅ Fácil comunicar
✅ Usuários entendem rapidamente

**Desvantagens**:
❌ Não penaliza 4K (alto custo para você)
❌ Pode perder dinheiro com usuários que baixam 4K

---

### C. Modelo Híbrido (Balanceado)
**Como funciona**:
- Limite de downloads + limite de GB por mês
- Exemplo: 100 downloads OU 50GB/mês (o que chegar primeiro)

**Planos**:
- Free: 10 downloads / 5GB
- Basic: 50 downloads / 25GB = $4.99/mês
- Pro: 200 downloads / 100GB = $9.99/mês
- Premium: Ilimitado = $19.99/mês

**Vantagens**:
✅ Protege contra abuso de 4K
✅ Simples de entender
✅ Balanceado para negócio

---

## 2. Gateway de Pagamento (Escolher um)

### Stripe (⭐ Recomendado)
**Custos**: 2.9% + $0.30 por transação
- ✅ Melhor UX
- ✅ Suporte a muitos países
- ✅ Subscriptions automáticas
- ✅ Dashboard robusto
- ✅ Webhooks confiáveis

### PayPal
**Custos**: 2.9% + $0.30 por transação
- ✅ Reconhecido globalmente
- ✅ Menos fricção para pagadores
- ❌ Dashboard complexo

### Lemonway / Mollie
**Custos**: Mais baratos (~1.5%) mas...
- ❌ Menos features
- ❌ Documentação inferior

---

## 3. Arquitetura de Sistema

### 3.1 Database Schema (Prisma)
```prisma
model Plan {
  id        String @id @default(cuid())
  name      String        // "Free", "Basic", "Pro", "Premium"
  price     Float         // $
  credits   Int          // Créditos/mês (ou -1 = ilimitado)
  downloads Int          // Downloads/mês
  gb        Float        // GB/mês
  features  String[]     // Features adicionais
  createdAt DateTime @default(now())
}

model Subscription {
  id           String @id @default(cuid())
  userId       String @unique
  planId       String
  stripeId     String? @unique  // Stripe subscription ID
  status       String  @default("active") // active, canceled, expired
  credits      Int     @default(0)        // Créditos restantes
  creditsReset DateTime? // Próximo reset de créditos
  downloads    Int     @default(0)        // Downloads este mês
  downloadsReset DateTime?
  gb           Float   @default(0)        // GB baixados este mês
  gbReset      DateTime?
  startDate    DateTime @default(now())
  endDate      DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  user         User @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan         Plan @relation(fields: [planId], references: [id])
}

model Payment {
  id            String @id @default(cuid())
  userId        String
  stripePaymentId String @unique
  amount        Float
  currency      String @default("USD")
  status        String // succeeded, pending, failed
  description   String?
  metadata      Json?
  createdAt     DateTime @default(now())
  
  user          User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Download {
  // ... campos existentes ...
  creditsUsed   Int?     // Créditos consumidos
  gbUsed        Float?   // GB consumidos
  size          BigInt?  // Tamanho real do arquivo
}
```

---

## 4. Implementação por Fase

### FASE 1: Autenticação & Users (Semana 1-2)
- [ ] Integrar NextAuth.js com GitHub/Google
- [ ] Criar tabelas User, Plan, Subscription no banco
- [ ] Dashboard básico de conta

### FASE 2: Stripe Integration (Semana 2-3)
- [ ] Criar produtos e planos no Stripe
- [ ] Implementar checkout
- [ ] Webhooks para atualizar subscriptions
- [ ] Página de billing

### FASE 3: Sistema de Quotas (Semana 3-4)
- [ ] Calcular créditos por download
- [ ] Validar quotas antes de download
- [ ] Rejeitar downloads sem créditos
- [ ] Mostrar uso no dashboard

### FASE 4: Analytics & Proteção (Semana 4-5)
- [ ] Dashboard de uso (créditos, downloads, GB)
- [ ] Rate limiting por plano
- [ ] Anti-fraud checks
- [ ] Emails de renovação

---

## 5. Fluxo de Download com Cobrança

```
1. Usuário busca vídeo
2. Sistema obtém metadados (duração, resolução)
3. Sistema calcula: creditsNeeded = duration * resolutionMultiplier
4. Verifica: if (user.subscription.credits >= creditsNeeded)
5. Se SIM: 
   - Enfileira download
   - Deduz créditos
   - Mostra progresso
6. Se NÃO:
   - Exibe erro "Créditos insuficientes"
   - Sugere upgrade de plano
   - Oferece créditos extras
```

---

## 6. Página de Pricing (O que mostrar)

```
┌─────────────────────────────────────────────────────┐
│ Free      | Basic      | Pro        | Premium       │
├─────────────────────────────────────────────────────┤
│ $0/mês    | $4.99/mês  | $9.99/mês  | $19.99/mês   │
│ 100 CR    | 500 CR     | 2000 CR    | Ilimitado    │
│ 10 DL     | 50 DL      | 200 DL     | Ilimitado    │
│ 5GB       | 25GB       | 100GB      | Ilimitado    │
└─────────────────────────────────────────────────────┘
```

---

## 7. Considerações Legais & Compliance

### Termos de Serviço
- [ ] Disclaimer: Respeito ao Copyright
- [ ] Não permite downloads para redistribuição
- [ ] Limite de taxa de requisição
- [ ] Proibição de bots/automação

### GDPR & Privacy
- [ ] Política de dados (onde armazena dados?)
- [ ] Direito de exclusão
- [ ] Consentimento para marketing
- [ ] Armazenamento de dados de pagamento (use Stripe!)

### Pagamentos
- [ ] Armazenar APENAS Stripe IDs (nunca dados de cartão)
- [ ] PCI DSS compliance (delegado ao Stripe)
- [ ] Invoices/Recibos
- [ ] Reembolsos

---

## 8. Estratégia de Conversão

### Fazer os Usuários Pagarem
1. **Free tier generoso** (mas limitado)
   - 100 créditos/mês = ~10 vídeos 1h 1080p
   - Suficiente para testar
   - Cria hábito

2. **Upgrade prompts inteligentes**
   - Quando créditos acabam: "Upgrade para Pro por $9.99/mês"
   - Modal bonito com benefícios
   - Oferecer bônus de créditos no primeiro mês

3. **Preço psicológico**
   - Basic: $4.99 (não $5.00)
   - Pro: $9.99 (não $10.00)
   - Annual: 30% desconto

4. **Email marketing**
   - Notify quando créditos < 20%
   - "Você usou 80% de seus créditos"
   - Sugerir upgrade

---

## 9. Próximas Decisões

❓ **Qual modelo você prefere?**
- A (Créditos) - Mais flexível, penaliza 4K
- B (Downloads) - Mais simples, pode perder dinheiro
- C (Híbrido) - Balanced

❓ **Que preços?**
- Agressivo: Basic $4.99, Pro $14.99, Premium $29.99
- Conservative: Basic $2.99, Pro $7.99, Premium $14.99

❓ **Suportar qual moeda?**
- Apenas USD?
- Multi-moeda com conversão?

❓ **Quando começar?**
- Agora com Free + Paid?
- Deixar crescer usuários grátis primeiro?

❓ **Freemium ou Paid-only?**
- Free tier (recomendado)
- Ou apenas 14 dias trial?

---

## 10. Roadmap Sugerido

**Semana 1**: Decisões (modelo, preços, gateway)
**Semana 2-3**: Autenticação + Stripe básico
**Semana 3-4**: Sistema de quotas
**Semana 4-5**: Landing page + Pricing
**Semana 5-6**: Marketing + Beta com amigos
**Semana 6-7**: Launch público

**Total: ~6-7 semanas até monetização ativa**

---

## 11. Custos Esperados

| Item | Custo |
|------|-------|
| Stripe | 2.9% + $0.30 por transação |
| Servidor API | ~$20-50/mês (AWS/DigitalOcean) |
| Database | ~$15/mês (Vercel Postgres) |
| Domínio | ~$12/ano |
| CDN (optional) | ~$20-100/mês |
| **Total** | **~$55-170/mês** |

**Break-even**: ~15-50 clientes no plano Basic/Pro

---

**Próximo passo**: Você gostaria que eu implementasse qual modelo primeiro?
