#!/bin/bash

# --- Стили оформления ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# --- Иконки ---
CHECKMARK="${GREEN}[OK]${NC}"
ERROR="${RED}[ERR]${NC}"
INFO="${CYAN}[INFO]${NC}"
WAIT="${YELLOW}[WAIT]${NC}"

handle_error() {
    echo -e "\n${ERROR} ${RED}Ошибка на строке $1. Установка прервана.${NC}"
    exit 1
}
trap 'handle_error $LINENO' ERR

read_input() {
    echo -ne "${CYAN}${BOLD}$1${NC}"
    read -r "$2" < /dev/tty
}

read_input_yn() {
    echo -ne "${CYAN}${BOLD}$1${NC}"
    read -n 1 -r REPLY < /dev/tty
    echo
}

REPO_URL="https://github.com/dottenv/3xshop.git"
PROJECT_DIR="3xshop"
NGINX_CONF_FILE="/etc/nginx/sites-available/${PROJECT_DIR}.conf"
ACTION_CHOICE=""

# Функция для определения типа обновления на основе изменений
detect_update_type() {
    if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
        echo -e "${INFO} Анализ изменений для определения типа обновления..."
        
        # Получаем последние коммиты
        git fetch origin
        LOCAL_HASH=$(git rev-parse HEAD)
        REMOTE_HASH=$(git rev-parse origin/main)
        
        if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
            echo -e "${CHECKMARK} У вас последняя версия."
            return 0
        fi
        
        # Анализируем изменения в последних коммитах
        CHANGES=$(git diff --name-only "$LOCAL_HASH" "$REMOTE_HASH")
        
        # Проверяем наличие критичных файлов
        if echo "$CHANGES" | grep -q -E "(docker-compose\.yml|Dockerfile|requirements\.txt|package\.json)"; then
            echo -e "${YELLOW}Обнаружены изменения в Docker конфигурации."
            echo -e "${INFO} Рекомендуется полное обновление (down + up)."
            return 2  # Полное обновление
        else
            echo -e "${CHECKMARK} Только изменения в коде приложения."
            echo -e "${INFO} Подходит для бесшовного обновления."
            return 1  # Бесшовное обновление
        fi
    fi
    return 0
}

echo -e "\n${BOLD}${CYAN}=====================================================${NC}"
echo -e "${BOLD}${CYAN}      Запуск установки/обновления 3xui-ShopBot    ${NC}"
echo -e "${BOLD}${CYAN}=====================================================${NC}\n"

if [ -f "$NGINX_CONF_FILE" ]; then
    echo -e "${INFO} ${CYAN}Обнаружена существующая конфигурация.${NC}"
    
    # Автоматическое определение типа обновления
    RECOMMENDED_UPDATE=""
    if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
        detect_update_type
        RECOMMENDED_UPDATE=$?
    elif [ -d "$PROJECT_DIR" ]; then
        cd "$PROJECT_DIR" || exit 1
        detect_update_type
        RECOMMENDED_UPDATE=$?
        cd ..
    fi
    
    echo -e "${BOLD}Выберите действие:${NC}"
    echo -e " 1) Бесшовное обновление (recreate контейнеров)"
    echo -e " 2) Полное обновление (down + up)"
    echo -e " 3) Полная переустановка (сброс Nginx, SSL и Docker)"
    echo -e " 4) Выход"
    
    # Показываем рекомендацию, если доступна
    if [ "$RECOMMENDED_UPDATE" = "1" ]; then
        echo -e "\n${GREEN}💡 Рекомендуется: Бесшовное обновление (только код)${NC}"
    elif [ "$RECOMMENDED_UPDATE" = "2" ]; then
        echo -e "\n${YELLOW}⚠️  Рекомендуется: Полное обновление (изменения в Docker)${NC}"
    fi
    
    read_input "Ваш выбор (1-4): " ACTION_CHOICE
    
    case $ACTION_CHOICE in
        1)
            echo -e "${INFO} ${CYAN}Бесшовное обновление (seamless update)...${NC}"
            # Проверяем, не находимся ли мы уже внутри папки проекта
            if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
                echo -e "${INFO} Вы уже находитесь в папке проекта."
            elif [ -d "$PROJECT_DIR" ]; then
                cd "$PROJECT_DIR" || exit 1
            else
                echo -e "${YELLOW}Папка проекта '${PROJECT_DIR}' не найдена, но конфиг Nginx существует.${NC}"
                read_input_yn "Хотите клонировать репозиторий заново? (y/n): "
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    git clone "$REPO_URL"
                    cd "$PROJECT_DIR" || exit 1
                else
                    echo -e "${ERROR} ${RED}Ошибка: Папка проекта '${PROJECT_DIR}' не найдена!${NC}"
                    echo -e "${YELLOW}Для исправления удалите конфиг Nginx и запустите заново:${NC}"
                    echo -e "sudo rm ${NGINX_CONF_FILE}"
                    exit 1
                fi
            fi

            echo -e "\n${WAIT} ${BOLD}Шаг 1: Обновление кода из Git...${NC}"
            # Сохраняем локальные изменения перед обновлением
            if [ -n "$(git status --porcelain)" ]; then
                echo -e "${INFO} Сохранение локальных изменений..."
                git stash push -m "Installer auto-stash before seamless update"
                STASHED=true
            fi

            if git pull; then
                echo -e "${CHECKMARK} Код успешно обновлен."
            else
                echo -e "${ERROR} ${RED}Ошибка при обновлении. Пробуем разрешить конфликт...${NC}"
                git stash pop 2>/dev/null
                exit 1
            fi

            if [ "$STASHED" = true ]; then
                 echo -e "${INFO} Восстановление локальных изменений..."
                 if ! git stash pop 2>/dev/null; then
                     echo -e "${YELLOW}ВНИМАНИЕ: Возник конфликт при восстановлении ваших изменений.${NC}"
                     echo -e "${YELLOW}Файлы были обновлены из репозитория, ваши правки сохранены в Git stash.${NC}"
                 fi
             fi

            echo -e "\n${WAIT} ${BOLD}Шаг 2: Бесшовное обновление контейнеров...${NC}"
            echo -e "${INFO} Создание новых контейнеров с сохранением данных..."
            
            # Бесшовное обновление: recreate вместо down/up
            sudo docker-compose pull
            sudo docker-compose up -d --build --force-recreate --remove-orphans
            
            # Проверяем статус контейнеров
            echo -e "${INFO} Проверка статуса контейнеров..."
            sleep 5
            if sudo docker-compose ps | grep -q "Up"; then
                echo -e "${CHECKMARK} Контейнеры успешно перезапущены."
            else
                echo -e "${YELLOW}ВНИМАНИЕ: Некоторые контейнеры могут не запуститься. Проверьте логи:${NC}"
                echo -e "sudo docker-compose logs"
            fi
            
            echo -e "\n${BOLD}${GREEN}==============================================${NC}"
            echo -e "${BOLD}${GREEN}     Бесшовное обновление завершено!       ${NC}"
            echo -e "${BOLD}${GREEN}==============================================${NC}"
            echo -e "\nБот был обновлен до последней версии с минимальным простоем."
            echo -e "Данные пользователей и настройки сохранены."
            exit 0
            ;;
        2)
            echo -e "${INFO} ${CYAN}Полное обновление (down + up)...${NC}"
            STASHED=false
            # Проверяем, не находимся ли мы уже внутри папки проекта
            if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
                echo -e "${INFO} Вы уже находитесь в папке проекта."
            elif [ -d "$PROJECT_DIR" ]; then
                cd "$PROJECT_DIR" || exit 1
            else
                echo -e "${YELLOW}Папка проекта '${PROJECT_DIR}' не найдена, но конфиг Nginx существует.${NC}"
                read_input_yn "Хотите клонировать репозиторий заново? (y/n): "
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    git clone "$REPO_URL"
                    cd "$PROJECT_DIR" || exit 1
                else
                    echo -e "${ERROR} ${RED}Ошибка: Папка проекта '${PROJECT_DIR}' не найдена!${NC}"
                    echo -e "${YELLOW}Для исправления удалите конфиг Nginx и запустите заново:${NC}"
                    echo -e "sudo rm ${NGINX_CONF_FILE}"
                    exit 1
                fi
            fi

            echo -e "\n${WAIT} ${BOLD}Шаг 1: Обновление кода из Git...${NC}"
            # Сохраняем локальные изменения перед обновлением, чтобы избежать конфликтов
            if [ -n "$(git status --porcelain)" ]; then
                echo -e "${INFO} Сохранение локальных изменений..."
                git stash push -m "Installer auto-stash before update"
                STASHED=true
            fi

            if git pull; then
                echo -e "${CHECKMARK} Код успешно обновлен."
            else
                echo -e "${ERROR} ${RED}Ошибка при обновлении. Пробуем разрешить конфликт...${NC}"
                git stash pop 2>/dev/null
                exit 1
            fi

            if [ "$STASHED" = true ]; then
                 echo -e "${INFO} Восстановление локальных изменений..."
                 if ! git stash pop 2>/dev/null; then
                     echo -e "${YELLOW}ВНИМАНИЕ: Возник конфликт при восстановлении ваших изменений.${NC}"
                     echo -e "${YELLOW}Файлы были обновлены из репозитория, ваши правки сохранены в Git stash.${NC}"
                 fi
             fi

            echo -e "\n${WAIT} ${BOLD}Шаг 2: Полный перезапуск Docker-контейнеров...${NC}"
            sudo docker-compose down --remove-orphans && sudo docker-compose up -d --build
            
            echo -e "\n${BOLD}${GREEN}==============================================${NC}"
            echo -e "${BOLD}${GREEN}      Обновление успешно завершено!      ${NC}"
            echo -e "${BOLD}${GREEN}==============================================${NC}"
            echo -e "\nБот был обновлен до последней версии и перезапущен."
            exit 0
            ;;
        3)
            echo -e "${WAIT} ${RED}Запуск полной переустановки...${NC}"
            # Очистка Docker
            if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
                sudo docker-compose down --remove-orphans 2>/dev/null
            elif [ -d "$PROJECT_DIR" ]; then
                cd "$PROJECT_DIR" && sudo docker-compose down --remove-orphans 2>/dev/null && cd ..
                # Предложим удалить старую папку
                read_input_yn "Удалить старую папку проекта для чистого клонирования? (y/n): "
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    sudo rm -rf "$PROJECT_DIR"
                    echo -e "${CHECKMARK} Папка проекта удалена."
                fi
            fi
            # Очистка Nginx
            NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/${PROJECT_DIR}.conf"
            sudo rm -f "$NGINX_CONF_FILE" "$NGINX_ENABLED_FILE"
            echo -e "${CHECKMARK} Конфигурации Nginx удалены."
            # Переход к чистой установке
            ;;
        *)
            echo "Выход."
            exit 0
            ;;
    esac
fi

if [ -z "$ACTION_CHOICE" ] || [ "$ACTION_CHOICE" = "2" ]; then
    if [ "$ACTION_CHOICE" = "2" ]; then
        echo -e "${INFO} ${YELLOW}Старая конфигурация удалена. Начинаем чистую установку...${NC}"
    else
        echo -e "${INFO} ${YELLOW}Конфигурация не найдена. Начинаем чистую установку...${NC}"
    fi
fi

echo -e "\n${BOLD}Шаг 1: Подготовка системных зависимостей...${NC}"

install_package() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${WAIT} Устанавливаем '$1'..."
        sudo apt-get update -qq
        sudo apt-get install -y "$2" > /dev/null 2>&1
        if ! command -v "$1" &> /dev/null; then
            # Проверка для certbot, который может быть в /usr/bin/certbot но не в PATH
            if [ -f "/usr/bin/$1" ]; then
                sudo ln -sf "/usr/bin/$1" "/usr/local/bin/$1"
            fi
        fi
        echo -e "   ${CHECKMARK} $1 установлен."
    else
        echo -e "   ${CHECKMARK} $1 уже готов."
    fi
}

install_package "git" "git"
install_package "docker" "docker.io"
install_package "docker-compose" "docker-compose"
install_package "nginx" "nginx"
install_package "curl" "curl"
install_package "dig" "dnsutils"
install_package "socat" "socat"

# Предварительная очистка Nginx перед запуском
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo -e "${WAIT} Удаляем стандартную конфигурацию Nginx..."
    sudo rm -f /etc/nginx/sites-enabled/default
fi

for service in docker nginx; do
    if ! sudo systemctl is-active --quiet "$service"; then
        echo -e "${WAIT} Запускаем сервис $service..."
        if ! sudo systemctl start "$service"; then
            echo -e "${ERROR} ${RED}Не удалось запустить $service. Проверьте логи: journalctl -u $service${NC}"
            exit 1
        fi
        sudo systemctl enable "$service" > /dev/null 2>&1
    fi
done
echo -e "${CHECKMARK} Все системные зависимости настроены."

echo -e "\n${BOLD}Шаг 2: Подготовка репозитория...${NC}"
if [ -d ".git" ] && [ -f "docker-compose.yml" ]; then
    echo -e "${CHECKMARK} Вы уже находитесь в папке проекта."
elif [ -d "$PROJECT_DIR" ]; then
    echo -e "${INFO} Папка проекта уже существует. Переходим в нее..."
    cd "$PROJECT_DIR" || exit 1
else
    echo -e "${WAIT} Клонирование репозитория..."
    git clone "$REPO_URL"
    cd "$PROJECT_DIR" || exit 1
fi
echo -e "${CHECKMARK} Репозиторий готов."

echo -e "\n${BOLD}Шаг 3: Настройка домена и SSL...${NC}"

read_input "Введите ваш домен (или IP-адрес): " USER_INPUT_DOMAIN

if [ -z "$USER_INPUT_DOMAIN" ]; then
    echo -e "${ERROR} ${RED}Домен или IP не может быть пустым.${NC}"
    exit 1
fi

# Проверка, является ли ввод IP-адресом
is_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

DOMAIN=$(echo "$USER_INPUT_DOMAIN" | sed -e 's%^https\?://%%' -e 's%/.*$%%' | tr -cd 'A-Za-z0-9.-' | tr '[:upper:]' '[:lower:]')
IS_IP_ADDR=false
if is_ip "$DOMAIN"; then
    IS_IP_ADDR=true
    echo -e "${INFO} Обнаружен IP-адрес. Установка будет выполнена без SSL."
else
    read_input "Введите ваш email (для SSL): " EMAIL
fi

if [ "$IS_IP_ADDR" = false ]; then
    # Установка acme.sh (метод как в 3x-ui), если еще не установлен
    if [ ! -f "$HOME/.acme.sh/acme.sh" ]; then
        echo -e "${WAIT} Установка acme.sh..."
        curl -sL https://get.acme.sh | sh -s email="$EMAIL" > /dev/null 2>&1
        "$HOME/.acme.sh/acme.sh" --set-default-ca --server letsencrypt --force > /dev/null 2>&1
        echo -e "   ${CHECKMARK} acme.sh установлен."
    fi

    echo -e "${INFO} Работаем с доменом: ${BOLD}${DOMAIN}${NC}"

    # Получение публичного IPv4 сервера без вывода HTML
    ipv4_re='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
    get_server_ip(){
        for url in \
            "https://api.ipify.org" \
            "https://ifconfig.co/ip" \
            "https://ipv4.icanhazip.com"; do
            ip=$(curl -fsS "$url" 2>/dev/null | tr -d '\r\n\t ')
            if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; return 0; fi
        done
        # Fallback: локальная информация (может вернуть приватный IP)
        ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; else echo ""; fi
    }

    # Разрешение IPv4 домена без обязательного dig
    resolve_domain_ip(){
        # 1) getent hosts (glibc)
        ip=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1)
        if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; return 0; fi
        # 2) dig, если доступен
        if command -v dig >/dev/null 2>&1; then
            ip=$(dig +short A "$DOMAIN" 2>/dev/null | grep -E "$ipv4_re" | head -n1)
            if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; return 0; fi
        fi
        # 3) nslookup, если доступен
        if command -v nslookup >/dev/null 2>&1; then
            ip=$(nslookup -type=A "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2; exit}')
            if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; return 0; fi
        fi
        # 4) ping -c1 (как крайний случай)
        if command -v ping >/dev/null 2>&1; then
            ip=$(ping -4 -c1 -W1 "$DOMAIN" 2>/dev/null | sed -n 's/.*(\([0-9.]*\)).*/\1/p' | head -n1)
            if [[ $ip =~ $ipv4_re ]]; then echo "$ip"; return 0; fi
        fi
        echo ""
    }

    SERVER_IP=$(get_server_ip)
    DOMAIN_IP=$(resolve_domain_ip)

    if [ -n "$SERVER_IP" ]; then
        echo -e "   ${INFO} IP сервера: ${BOLD}$SERVER_IP${NC}"
    fi

    if [ -n "$DOMAIN_IP" ]; then
        echo -e "   ${INFO} IP домена:  ${BOLD}$DOMAIN_IP${NC}"
    fi

    if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
        echo -e "\n${RED}${BOLD}ВНИМАНИЕ: DNS-запись домена не указывает на этот сервер!${NC}"
        read_input_yn "Продолжить установку? (y/n): "
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then echo "Установка прервана."; exit 1; fi
    fi
fi

if command -v ufw &> /dev/null; then
    echo -e "${WAIT} Настройка файрвола (ufw)..."
    sudo ufw allow 80/tcp > /dev/null 2>&1
    sudo ufw allow 443/tcp > /dev/null 2>&1
    sudo ufw allow 1488/tcp > /dev/null 2>&1
    # На всякий случай открываем и 8443, если кто-то захочет использовать его
    sudo ufw allow 8443/tcp > /dev/null 2>&1
elif command -v iptables &> /dev/null; then
    echo -e "${WAIT} Настройка файрвола (iptables)..."
    sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT > /dev/null 2>&1
    sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT > /dev/null 2>&1
fi

if [ "$IS_IP_ADDR" = false ]; then
     CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
     mkdir -p "$CERT_PATH"

     if [ -f "$CERT_PATH/fullchain.pem" ]; then
         echo -e "${CHECKMARK} SSL-сертификаты для домена ${BOLD}$DOMAIN${NC} уже существуют."
         
         # Проверка срока действия сертификата
         EXP_DATE=$(sudo openssl x509 -enddate -noout -in "$CERT_PATH/fullchain.pem" | cut -d= -f2)
         echo -e "   ${INFO} Срок действия: ${YELLOW}$EXP_DATE${NC}"
         
         read_input_yn "Перевыпустить сертификат? (y/n): "
         if [[ $REPLY =~ ^[Yy]$ ]]; then
             echo -e "${WAIT} Перевыпуск сертификата..."
             sudo systemctl stop nginx
             if "$HOME/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 --force && \
                "$HOME/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" --key-file "$CERT_PATH/privkey.pem" --fullchain-file "$CERT_PATH/fullchain.pem"; then
                 echo -e "${CHECKMARK} Сертификат успешно обновлен."
             else
                 echo -e "${ERROR} ${RED}Ошибка при перевыпуске сертификата.${NC}"
                 sudo systemctl start nginx
                 exit 1
             fi
             sudo systemctl start nginx
         fi
     else
         echo -e "${WAIT} Получение SSL-сертификатов через acme.sh..."
         sudo systemctl stop nginx
         if "$HOME/.acme.sh/acme.sh" --issue -d "$DOMAIN" --standalone --httpport 80 && \
            "$HOME/.acme.sh/acme.sh" --install-cert -d "$DOMAIN" --key-file "$CERT_PATH/privkey.pem" --fullchain-file "$CERT_PATH/fullchain.pem"; then
             echo -e "${CHECKMARK} SSL-сертификаты успешно получены."
         else
             echo -e "\n${ERROR} ${RED}acme.sh не смог получить сертификат.${NC}"
             echo -e "${YELLOW}Возможные причины:${NC}"
             echo -e " 1. Порт 80 занят другим процессом."
             echo -e " 2. Домен не указывает на этот сервер."
             echo -e " 3. Проблема с доступом к серверам Let's Encrypt."
             sudo systemctl start nginx
             read_input_yn "Продолжить без SSL? (y/n): "
             if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
         fi
         sudo systemctl start nginx
     fi
 else
     echo -e "${INFO} Пропуск настройки SSL для IP-адреса."
 fi

echo -e "\n${BOLD}Шаг 4: Настройка Nginx...${NC}"
# Настройка портов и URL (переход на стандартные 80/443)
if [ "$IS_IP_ADDR" = false ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    HAS_SSL=true
    NGINX_LISTEN_PORT=443
    BASE_URL="https://${DOMAIN}"
else
    HAS_SSL=false
    NGINX_LISTEN_PORT=80
    BASE_URL="http://${DOMAIN}"
    if [ "$IS_IP_ADDR" = false ]; then
        echo -e "${YELLOW}Внимание: SSL-сертификаты не найдены. Конфигурация Nginx будет создана без SSL (порт 80).${NC}"
    fi
fi

NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/${PROJECT_DIR}.conf"

echo -e "${WAIT} Создание конфигурации Nginx..."

# Генерация конфигурации Nginx
if [ "$HAS_SSL" = true ]; then
    cat <<EOF | sudo tee "$NGINX_CONF_FILE" > /dev/null
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen ${NGINX_LISTEN_PORT} ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    location / {
        proxy_pass http://127.0.0.1:1488;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
    cat <<EOF | sudo tee "$NGINX_CONF_FILE" > /dev/null
server {
    listen ${NGINX_LISTEN_PORT};
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:1488;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

if [ ! -f "$NGINX_ENABLED_FILE" ]; then
    sudo ln -s "$NGINX_CONF_FILE" "$NGINX_ENABLED_FILE"
fi

echo -e "${WAIT} Проверка и перезагрузка Nginx..."
sudo nginx -t && sudo systemctl reload nginx
echo -e "${CHECKMARK} Nginx настроен."

echo -e "\n${BOLD}Шаг 5: Запуск Docker...${NC}"

if [ "$(sudo docker-compose ps -q)" ]; then
    echo -e "${WAIT} Перезапуск существующих контейнеров..."
    sudo docker-compose down > /dev/null 2>&1
fi

sudo docker-compose up -d --build
echo -e "${CHECKMARK} Контейнеры запущены."

echo -e "\n${BOLD}${GREEN}=====================================================${NC}"
echo -e "${BOLD}${GREEN}      Установка и запуск успешно завершены!      ${NC}"
echo -e "${BOLD}${GREEN}=====================================================${NC}"

echo -e "\n${BOLD}Веб-панель доступна по адресу:${NC}"
echo -e "  [URL] ${YELLOW}${BASE_URL}/login${NC}"

echo -e "\n${BOLD}Данные для входа:${NC}"
echo -e "  [Login]   ${CYAN}admin${NC}"
echo -e "  [Pass]  ${CYAN}admin${NC}"

echo -e "\n${BOLD}${RED}ПЕРВЫЕ ШАГИ:${NC}"
echo -e " 1. Войдите в панель и ${BOLD}смените логин/пароль${NC}."
echo -e " 2. В 'Настройках' укажите токен бота и ваш Telegram ID."
echo -e " 3. Нажмите 'Сохранить' и 'Запустить Бота'."

echo -e "\n${INFO} ${CYAN}Webhook URL для YooKassa:${NC}"
echo -e " ${YELLOW}${BASE_URL}/yookassa-webhook${NC}\n"

echo -e "\n${BOLD}${CYAN}=====================================================${NC}"
echo -e "${BOLD}${CYAN}               Методы обновления                ${NC}"
echo -e "${BOLD}${CYAN}=====================================================${NC}\n"

echo -e "${BOLD}1) Бесшовное обновление (seamless):${NC}"
echo -e "   • Использует 'docker-compose up --force-recreate'"
echo -e "   • Минимальный простой (5-10 секунд)"
echo -e "   • Данные сохраняются в Docker volumes"
echo -e "   • Идеально для мелких апдейтов и исправлений"
echo -e "   • Сохраняет активные сессии пользователей\n"

echo -e "${BOLD}2) Полное обновление (down + up):${NC}"
echo -e "   • Полная остановка и запуск контейнеров"
echo -e "   • Более длительный простой (30-60 секунд)"
echo -e "   • Гарантированная чистое состояние"
echo -e "   • Рекомендуется для крупных изменений\n"

echo -e "${BOLD}3) Полная переустановка:${NC}"
echo -e "   • Удаление всех конфигураций"
echo -e "   • Чистая установка с нуля"
echo -e "   • Используется при серьезных проблемах\n"

echo -e "${INFO} ${YELLOW}Для быстрого обновления используйте:${NC}"
echo -e "   ${CYAN}./install.sh${NC} и выберите опцию 1\n"
