<template>
    <v-flex
        v-if="sidebar_menu_state != 0 && current_menu"
        xs2
        fixed
    >
        <v-list
            color="expanded_sidebar"
            :style="`border-right: 1px solid ${is_dark_mode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'} !important;`"
            height="100%"
        >
            <h2>{{ current_menu.title }}</h2>
            <v-divider></v-divider>
            
            <sidebar-content
                :menu_type="current_menu.menu_type" 
                :sidebar="current_menu"
            />
        </v-list>
    </v-flex>
</template>

<script>
    import SidebarContent from "./Content";

    export default {
        name: "sidebar-main",
        components: {
            SidebarContent
        },
        computed: {
            is_dark_mode() {
                return this.$store.state.Appearance.is_dark_mode;
            },
            menu_items() {
                return this.$store.getters.all_items;
            },
            sidebar_menu_state() {
                return this.$store.state.SidebarMenu.menu_state;
            },
            current_menu() {
                return this.menu_items[this.sidebar_menu_state - 1];
            },
            is_dark_mode() {
                return this.$store.state.Appearance.is_dark_mode;
            }
        },
        data() {
            return {
                
            };
        },
        methods: {
            
        }
    }
</script>

<style scoped>
    h2 {
        padding-left: 0.25em;
    }
</style>
